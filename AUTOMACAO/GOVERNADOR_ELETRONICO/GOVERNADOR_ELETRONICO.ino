// ============================================================================
// GOVERNADOR_ELETRONICO.ino
// ESP32 — Substituto do Regulador Eletrônico RCB93
//
// ── LISTA DE MATERIAIS (BOM) ─────────────────────────────────────────────────
//
//  1. ESP32 — 38 pinos (DevKit V1 ou compatível)
//     Microcontrolador principal. Wi-Fi + Bluetooth Classic integrado.
//     Alimentação: 3V3 interno (não usar 5V nos pinos de I/O).
//
//  2. Fonte Ajustável LM2596
//     Converte a tensão do sistema (ex: 12 V do trator) para 5 V → ESP32 via USB/VIN.
//     Ajustar o trimpot da fonte para 5,0 V antes de conectar ao ESP32.
//
//  3. Módulo Driver Ponte-H BTS7960 43A
//     Aciona o motor de corrente contínua via PWM.
//     Apenas o lado direito é utilizado (R_PWM, R_EN, R_IS).
//     Ligado DIRETAMENTE ao ESP32 — sem optoacoplador nesta via.
//     Alimentação de potência: tensão do motor (12–24 V conforme a aplicação).
//     Ligações:
//       VCC   → 5 V (lógica do módulo)    GND  → GND comum
//       R_PWM → GPIO25 (direto)           R_EN → GPIO27 (direto, mantido HIGH)
//       R_IS  → GPIO32 (leitura de corrente — opcional)
//       L_PWM, L_EN, L_IS → NÃO CONECTAR
//
//  4. Módulo Optoacoplador 4 canais
//     Isola galvanicamente o sinal do Sensor Hall NPN do ESP32.
//     Protege o GPIO33 de ruídos e transientes gerados pelo sensor indutivo.
//     Especificações do módulo: resistor SMD 302 (3 kΩ) na entrada e na saída;
//     JUMPER no GND de saída presente (GND saída conectado ao GND do ESP32).
//     Canal utilizado:
//       Entrada canal 1 → fio preto (sinal) do Sensor Hall NPN
//       Saída  canal 1 → GPIO33 do ESP32  (INPUT_PULLUP, interrupção FALLING)
//     Canais 2, 3 e 4 → reserva.
//     ATENÇÃO: com o resistor SMD 302 (3 kΩ) na entrada e VCC do sensor em 5 V,
//     a corrente de LED do optoacoplador fica em ~1,3 mA — suficiente para
//     disparar o PC817 (If_min = 0,5 mA). Não remover o resistor SMD.
//
//  5. Potenciômetro 10 kΩ — controle manual de velocidade
//     Terminal 1 → 3V3
//     Terminal 2 (cursor/wiper) → GPIO34  (ADC1_CH6 — somente entrada)
//     Terminal 3 → GND
//
//  6. Chave Seletora 2 posições (rotativa ou gangorra) — MANUAL / AUTO
//     Posição 13-14 (MANUAL) → GPIO13 = LOW  → potenciômetro controla PWM direto
//     Posição 23-24 (AUTO)   → GPIO13 = HIGH → PID controla PWM pelo RPM
//     Ligação: pino comum → GPIO13 (INPUT_PULLDOWN interno)
//              contato AUTO → 3V3
//              contato MANUAL → GND  (ou deixar aberto com PULLDOWN)
//
//  7. Display LCD TFT 2.4" — ILI9341 (SPI, 240×320 px)
//     Exibe RPM, duty cycle, modo, Kp/Ki/Kd e status Bluetooth.
//     Ligações (VSPI):
//       VCC → 3V3     GND → GND
//       CS  → GPIO21  RST → GPIO4   DC/RS → GPIO16
//       MOSI→ GPIO23  SCK → GPIO18  MISO  → GPIO19 (opcional)
//       LED → 3V3 (retroiluminação sempre ligada)
//       T_CS / T_* → NÃO CONECTAR (touch não utilizado)
//     Biblioteca: TFT_eSPI (Bodmer) — configurar User_Setup.h:
//       #define ILI9341_DRIVER
//       #define TFT_CS 21  / TFT_DC 16  / TFT_RST 4
//       #define TFT_MOSI 23 / TFT_SCLK 18 / TFT_MISO 19
//       #define SPI_FREQUENCY 40000000
//
//  8. Sensor Hall Indutivo NPN — 3 fios — roda fônica 20 dentes
//     Detecta cada dente da roda fônica. Saída NPN: LOW quando dente detectado.
//     Fios:
//       Marrom → VCC (5–24 V conforme spec do sensor — verificar datasheet)
//       Azul   → GND
//       Preto  → Sinal → GPIO33 (INPUT_PULLUP, interrupção FALLING)
//     Observação: GPIO33 tem resistor pull-up interno de ~45 kΩ ativado em software.
//     Para cabos > 2 m adicionar capacitor 100 nF entre GPIO33 e GND (no ESP32)
//     para filtrar ruído do motor / PWM.
//     Roda fônica: 20 dentes → PPR = 20 → 617 Hz a 1850 RPM.
//
// ── LÓGICA DE CONTROLE ────────────────────────────────────────────────────────
//
//   PID ação reversa:
//   erro = RPM_atual - RPM_setpoint
//   saída = basePWM + Kp*erro + Ki*∫erro*dt + Kd*(dRPM/dt)
//
//   Quando RPM cai abaixo do setpoint:
//     → erro negativo → saída diminui → carga aliviada → motor recupera
//   Ki elimina o erro em regime permanente (motor trava exatamente no setpoint).
//   Kd amorte oscilações em mudanças bruscas de carga.
//
// Pinos — ver globals.h para tabela completa.
//
// ── PROTOCOLO BLUETOOTH (SPP), mensagens terminadas em '\n' ──────────────────
//
//   App → ESP32
//   SET_SP:<rpm>         → RPM alvo
//   SET_PPR:<n>          → pulsos por revolução
//   SET_BASE_PWM:<0-255> → duty em RPM nominal
//   SET_KP:<f>           → ganho proporcional  (ex: SET_KP:0.05)
//   SET_KI:<f>           → ganho integral      (ex: SET_KI:0.01)
//   SET_KD:<f>           → ganho derivativo    (ex: SET_KD:0.002)
//   SET_MIN_PWM:<0-255>  → duty mínimo em AUTO
//   SET_MAX_PWM:<0-255>  → duty máximo
//   SET_MODE:AUTO|MANUAL → (informativo; modo real = chave GPIO13)
//   CALIB:START          → telemetria 100 ms, congela PWM
//   CALIB:END            → volta ao normal
//   PID:RESET            → zera integral e derivativo
//   GET_STATUS           → JSON imediato
//   SAVE                 → persiste EEPROM
//
//   ESP32 → App (JSON a cada 500 ms ou 100 ms em CALIB)
//   {"rpm":1200,"sp":1000,"pwm":185,"mode":"AUTO","pot":2048,
//    "ppr":20,"kp":0.05,"ki":0.01,"kd":0.002,"err":-200.0}
//
// Dependências: BluetoothSerial, TFT_eSPI (Bodmer)
// TFT_eSPI — User_Setup.h:
//   #define ILI9341_DRIVER
//   #define TFT_CS 21 / TFT_DC 16 / TFT_RST 4
//   #define TFT_MOSI 23 / TFT_SCLK 18 / TFT_MISO 19
//   #define SPI_FREQUENCY 40000000
// ============================================================================

#include "globals.h"

#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
  #error "Bluetooth Classic nao habilitado. Va em Tools > Partition Scheme > Default 4MB with spiffs"
#endif

// ─── Variáveis globais ───────────────────────────────────────────────────────

BluetoothSerial SerialBT;
TFT_eSPI        tft;
Config          cfg;

volatile uint32_t hallPulses = 0;
float  rpmAtual   = 0.0f;
float  pwmSuave   = 0.0f;   // usado apenas no modo MANUAL para transição bumpless
bool   modoManual = false;
bool   modoCalib  = false;

// Estado do PID
static float pidIntegral  = 0.0f;
static float pidRpmPrev   = 0.0f;  // derivativo sobre RPM (evita "derivative kick")
static bool  pidPrimeiroLoop = true;

// Estado de proteção (stall detection)
static unsigned long rpmAbaixoMinSince = 0; // millis() em que RPM caiu abaixo do mínimo; 0 = OK
static bool          modoFalha         = false;

// Timers
unsigned long ultimoRPM     = 0;
unsigned long ultimoBT      = 0;
unsigned long ultimoDisplay = 0;
unsigned long ultimoRPMDisp = 0;
unsigned long ultimoKeep    = 0;

// ─── ISR do sensor Hall ──────────────────────────────────────────────────────

void IRAM_ATTR hallISR() {
  hallPulses++;
}

// ─── EEPROM ─────────────────────────────────────────────────────────────────

static void carregarConfig() {
  EEPROM.begin(EEPROM_SIZE);
  if (EEPROM.read(EEPROM_MAGIC) == EEPROM_MAGIC_VAL) {
    EEPROM.get(EEPROM_CFG, cfg);
  } else {
    cfg = CFG_DEFAULT;
    Serial.println("[EEPROM] Config padrao carregada.");
  }
}

static void salvarConfig() {
  EEPROM.write(EEPROM_MAGIC, EEPROM_MAGIC_VAL);
  EEPROM.put(EEPROM_CFG, cfg);
  EEPROM.commit();
  Serial.println("[EEPROM] Config salva.");
}

// ─── PID ─────────────────────────────────────────────────────────────────────

static void pidReset(float rpmInicial, float pwmInicial) {
  // Inicializa o integral para que a saída bata com pwmInicial sem bump.
  // Garante transferência suave de MANUAL → AUTO.
  float erro = rpmInicial - (float)cfg.setpointRPM;
  if (cfg.Ki > 1e-6f)
    pidIntegral = (pwmInicial - cfg.basePWM - cfg.Kp * erro) / cfg.Ki;
  else
    pidIntegral = 0.0f;

  pidRpmPrev       = rpmInicial;
  pidPrimeiroLoop  = false;
}

static uint8_t calcularDutyPID(float rpm, float dtSec) {
  float setpoint = (float)cfg.setpointRPM;

  // Ação reversa: erro positivo quando RPM > setpoint → saída sobe → carga aumenta
  //               erro negativo quando RPM < setpoint → saída cai  → carga alivia
  float erro = rpm - setpoint;

  // Termo integral com anti-windup por clamp simétrico
  float integralMax = (float)(cfg.maxPWM - cfg.minPWM) / (cfg.Ki > 1e-6f ? cfg.Ki : 1.0f);
  pidIntegral += erro * dtSec;
  pidIntegral  = constrain(pidIntegral, -integralMax, integralMax);

  // Derivativo sobre o RPM (não sobre o erro), evita "derivative kick"
  // quando o setpoint muda abruptamente.
  float derivRPM = (rpm - pidRpmPrev) / dtSec;
  pidRpmPrev     = rpm;

  // Saída: basePWM é o ponto de operação nominal
  float saida = (float)cfg.basePWM
                + cfg.Kp * erro
                + cfg.Ki * pidIntegral
                + cfg.Kd * derivRPM;

  // Clamp final
  return (uint8_t)constrain((int)saida, cfg.minPWM, cfg.maxPWM);
}

// ─── Medição de RPM ─────────────────────────────────────────────────────────

static float medirRPM(uint32_t intervalMs) {
  uint32_t pulsos;
  noInterrupts();
  pulsos     = hallPulses;
  hallPulses = 0;
  interrupts();
  if (cfg.ppr == 0) cfg.ppr = 1;
  return (float)pulsos / (float)cfg.ppr * (60000.0f / (float)intervalMs);
}

// ─── Display ILI9341 ────────────────────────────────────────────────────────

static void displayInicial() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(4, 4);
  tft.print("GOVERNADOR ELETRONICO");
  tft.drawFastHLine(0, 16, 320, TFT_DARKGREY);
}

static void displayAtualizarRPM(float rpm, uint8_t duty, bool manual) {
  char buf[24];

  // RPM grande
  tft.setTextSize(4);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setCursor(8, 28);
  snprintf(buf, sizeof(buf), "%5.0f", rpm);
  tft.print(buf);
  tft.setTextSize(2);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(196, 44);
  tft.print("RPM");

  // Duty
  tft.setTextSize(2);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setCursor(8, 84);
  snprintf(buf, sizeof(buf), "PWM: %3d/255", duty);
  tft.print(buf);

  // Barra PWM
  uint16_t barW = (uint16_t)map(duty, 0, 255, 0, 300);
  tft.fillRect(8,         108, barW,       12, TFT_BLUE);
  tft.fillRect(8 + barW, 108, 300 - barW, 12, TFT_NAVY);

  // Modo / Falha
  tft.setTextSize(2);
  if (modoFalha) {
    tft.setTextColor(TFT_RED, TFT_BLACK);
    tft.setCursor(8, 130);
    tft.print("!! FALHA RPM !!");
  } else {
    tft.setTextColor(manual ? TFT_ORANGE : TFT_CYAN, TFT_BLACK);
    tft.setCursor(8, 130);
    tft.print(manual ? "MODO: MANUAL" : "MODO: AUTO  ");
  }
}

static void displayAtualizarInfo() {
  char buf[48];
  tft.setTextSize(1);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(8, 158);
  snprintf(buf, sizeof(buf), "SP: %4d RPM   PPR: %d   BASE: %d",
           cfg.setpointRPM, cfg.ppr, cfg.basePWM);
  tft.print(buf);

  tft.setCursor(8, 170);
  snprintf(buf, sizeof(buf), "Kp:%.3f  Ki:%.3f  Kd:%.3f",
           cfg.Kp, cfg.Ki, cfg.Kd);
  tft.print(buf);

  tft.setCursor(8, 182);
  tft.setTextColor(SerialBT.hasClient() ? TFT_GREEN : TFT_RED, TFT_BLACK);
  tft.print(SerialBT.hasClient() ? "BT: CONECTADO  " : "BT: AGUARDANDO ");
}

// ─── Comandos BT ─────────────────────────────────────────────────────────────

static void processarComando(const String& linha) {
  if (linha.startsWith("SET_SP:")) {
    int val = linha.substring(7).toInt();
    if (val > 0 && val <= 30000) {
      cfg.setpointRPM = (uint16_t)val;
      pidReset(rpmAtual, (float)ledcRead(PWM_CHANNEL)); // evita bump ao mudar setpoint
      SerialBT.println("OK:SET_SP");
    }
  }
  else if (linha.startsWith("SET_PPR:")) {
    int val = linha.substring(8).toInt();
    if (val >= 1 && val <= 200) {
      cfg.ppr = (uint8_t)val;
      SerialBT.println("OK:SET_PPR");
    }
  }
  else if (linha.startsWith("SET_BASE_PWM:")) {
    int val = linha.substring(13).toInt();
    cfg.basePWM = (uint8_t)constrain(val, 0, 255);
    pidReset(rpmAtual, (float)ledcRead(PWM_CHANNEL));
    SerialBT.println("OK:SET_BASE_PWM");
  }
  else if (linha.startsWith("SET_KP:")) {
    float val = linha.substring(7).toFloat();
    if (val >= 0.0f && val <= 100.0f) { cfg.Kp = val; SerialBT.println("OK:SET_KP"); }
  }
  else if (linha.startsWith("SET_KI:")) {
    float val = linha.substring(7).toFloat();
    if (val >= 0.0f && val <= 10.0f)  { cfg.Ki = val; pidIntegral = 0.0f; SerialBT.println("OK:SET_KI"); }
  }
  else if (linha.startsWith("SET_KD:")) {
    float val = linha.substring(7).toFloat();
    if (val >= 0.0f && val <= 10.0f)  { cfg.Kd = val; SerialBT.println("OK:SET_KD"); }
  }
  else if (linha.startsWith("SET_MIN_PWM:")) {
    int val = linha.substring(12).toInt();
    cfg.minPWM = (uint8_t)constrain(val, 0, 254);
    SerialBT.println("OK:SET_MIN_PWM");
  }
  else if (linha.startsWith("SET_MAX_PWM:")) {
    int val = linha.substring(12).toInt();
    cfg.maxPWM = (uint8_t)constrain(val, 1, 255);
    SerialBT.println("OK:SET_MAX_PWM");
  }
  else if (linha == "SET_MODE:AUTO" || linha == "SET_MODE:MANUAL") {
    SerialBT.println("OK:MODE");
  }
  else if (linha == "CALIB:START") {
    modoCalib = true;
    SerialBT.println("OK:CALIB_START");
  }
  else if (linha == "CALIB:END") {
    modoCalib = false;
    pidReset(rpmAtual, (float)ledcRead(PWM_CHANNEL));
    SerialBT.println("OK:CALIB_END");
  }
  else if (linha == "PID:RESET") {
    pidReset(rpmAtual, (float)ledcRead(PWM_CHANNEL));
    SerialBT.println("OK:PID_RESET");
  }
  else if (linha == "GET_STATUS") {
    ultimoBT = 0;
  }
  else if (linha == "SAVE") {
    salvarConfig();
    SerialBT.println("OK:SAVE");
  }
  else if (linha.startsWith("SET_RPM_MIN:")) {
    int val = linha.substring(12).toInt();
    if (val >= 100 && val <= 5000) {
      cfg.rpmMinSeguranca = (uint16_t)val;
      if (rpmAtual >= (float)cfg.rpmMinSeguranca) {
        modoFalha         = false;
        rpmAbaixoMinSince = 0;
        pidPrimeiroLoop   = true;
      }
      SerialBT.println("OK:SET_RPM_MIN");
    } else {
      SerialBT.println("ERR:SET_RPM_MIN:FORA_DO_RANGE");
    }
  }
  else {
    SerialBT.print("ERR:CMD_DESCONHECIDO:");
    SerialBT.println(linha);
  }
}

// ─── Telemetria JSON ─────────────────────────────────────────────────────────

static void enviarStatus(float rpm, uint8_t duty) {
  char json[220];
  float erro = rpm - (float)cfg.setpointRPM;
  snprintf(json, sizeof(json),
    "{\"rpm\":%.1f,\"sp\":%d,\"pwm\":%d,\"mode\":\"%s\","
    "\"pot\":%d,\"ppr\":%d,\"kp\":%.4f,\"ki\":%.4f,\"kd\":%.4f,"
    "\"err\":%.1f,\"fault\":%d,\"rpmMin\":%d}\n",
    rpm,
    cfg.setpointRPM,
    duty,
    modoManual ? "MANUAL" : "AUTO",
    analogRead(POT_PIN),
    cfg.ppr,
    cfg.Kp, cfg.Ki, cfg.Kd,
    erro,
    modoFalha ? 1 : 0,
    cfg.rpmMinSeguranca
  );
  SerialBT.print(json);
}

// ─── Callback SPP ────────────────────────────────────────────────────────────

static void btCallback(esp_spp_cb_event_t event, esp_spp_cb_param_t* param) {
  (void)param;
  if (event == ESP_SPP_SRV_OPEN_EVT) {
    ultimoKeep = millis();
    modoCalib  = false;
    pidReset(rpmAtual, (float)ledcRead(PWM_CHANNEL));
    Serial.println("[BT] Cliente conectado.");
  } else if (event == ESP_SPP_CLOSE_EVT) {
    Serial.println("[BT] Cliente desconectado.");
  }
}

// ============================================================================
// setup()
// ============================================================================
void setup() {
  Serial.begin(115200);
  Serial.println("[GOV] Governador Eletronico iniciando...");

  carregarConfig();

  pinMode(EN_PIN, OUTPUT);
  digitalWrite(EN_PIN, HIGH);
  pinMode(MODE_PIN, INPUT_PULLDOWN);
  pinMode(POT_PIN,  INPUT);

  // Sensor Hall — NPN: saída LOW quando detecto → borda FALLING
  pinMode(HALL_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(HALL_PIN), hallISR, FALLING);

  ledcSetup(PWM_CHANNEL, PWM_FREQ_HZ, PWM_RESOLUTION);
  ledcAttachPin(PWM_PIN, PWM_CHANNEL);
  ledcWrite(PWM_CHANNEL, 0);

  // Bluetooth ANTES do display: SerialBT.begin() acessa a flash NVS e gera
  // atividade no barramento interno que corrompe a inicialização SPI do TFT.
  SerialBT.begin(cfg.btName);
  SerialBT.register_callback(btCallback);
  esp_bt_sleep_disable();
  esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_GENERAL_DISCOVERABLE);
  Serial.printf("[BT] Iniciado como \"%s\"\n", cfg.btName);

  // Display após BT — SPI estável; pequeno delay para rádio se acomodar
  delay(120);
  tft.init();
  tft.setRotation(1);
  displayInicial();

  pidPrimeiroLoop = true;
  unsigned long agora0 = millis();
  ultimoRPM     = agora0;
  ultimoRPMDisp = agora0; // evita update imediato com duty=0 (barW=0 → fillRect 0px)
  ultimoDisplay = agora0;
  ultimoBT      = agora0;
  ultimoKeep    = agora0;
  Serial.println("[GOV] Pronto.");
}

// ============================================================================
// loop()
// ============================================================================
void loop() {
  unsigned long agora = millis();

  // ── 1. Modo da chave física ──────────────────────────────────────────────
  bool modoManualAnterior = modoManual;
  modoManual = (digitalRead(MODE_PIN) == LOW);

  uint8_t dutyAtual = (uint8_t)ledcRead(PWM_CHANNEL);

  // ── 2. Janela de cálculo de RPM e controle ──────────────────────────────
  if (agora - ultimoRPM >= RPM_INTERVAL_MS) {
    uint32_t intervalo = agora - ultimoRPM;
    ultimoRPM = agora;
    float dtSec = intervalo / 1000.0f;

    rpmAtual = medirRPM(intervalo);

    // ── Proteção: stall / falha de sensor (apenas AUTO, não em CALIB) ────────
    if (!modoManual && !modoCalib) {
      if (rpmAtual < (float)cfg.rpmMinSeguranca) {
        if (rpmAbaixoMinSince == 0) rpmAbaixoMinSince = agora;
        if (!modoFalha && (agora - rpmAbaixoMinSince) >= RPM_MIN_TIMEOUT_MS) {
          modoFalha       = true;
          pidPrimeiroLoop = true; // garante pidReset bumpless na recuperação
          ledcWrite(PWM_CHANNEL, 0);
          Serial.println("[GOV] FALHA: RPM abaixo do minimo — PWM zerado.");
        }
      } else {
        if (modoFalha) {
          modoFalha       = false;
          pidPrimeiroLoop = true; // reinicia PID bumpless a partir de PWM=0
          Serial.println("[GOV] FALHA: RPM recuperado — retomando controle.");
        }
        rpmAbaixoMinSince = 0;
      }
    } else {
      rpmAbaixoMinSince = 0;
      if (modoManual) modoFalha = false;
    }

    if (modoManual) {
      // MANUAL: potenciômetro → PWM direto
      int   raw  = analogRead(POT_PIN);
      float duty = (raw / 4095.0f) * (float)cfg.maxPWM;
      if (duty > 0.0f && duty < cfg.minPWM) duty = (float)cfg.minPWM;
      dutyAtual = (uint8_t)constrain((int)duty, 0, cfg.maxPWM);
      ledcWrite(PWM_CHANNEL, dutyAtual);

      // Prepara PID para transição suave quando voltar ao AUTO
      pidRpmPrev = rpmAtual;

    } else {
      if (modoFalha) {
        dutyAtual = 0;
        // PWM já zerado no trigger; manter aqui apenas para display/BT
      } else {
        // Transição MANUAL → AUTO: inicializa integral sem bump
        if (modoManualAnterior || pidPrimeiroLoop) {
          pidReset(rpmAtual, (float)dutyAtual);
        }

        if (!modoCalib) {
          // AUTO: PID completo
          dutyAtual = calcularDutyPID(rpmAtual, dtSec);
          ledcWrite(PWM_CHANNEL, dutyAtual);
        }
        // CALIB: PWM congelado
      }
    }
  }

  // ── 3. Comandos BT ───────────────────────────────────────────────────────
  if (SerialBT.available()) {
    String linha = SerialBT.readStringUntil('\n');
    linha.trim();
    if (linha.length() > 0) {
      ultimoKeep = agora;
      processarComando(linha);
    }
  }

  // ── 4. Telemetria BT ─────────────────────────────────────────────────────
  if (SerialBT.hasClient()) {
    uint32_t intervBT = modoCalib ? BT_CALIB_MS : BT_STATUS_MS;
    if (agora - ultimoBT >= intervBT) {
      ultimoBT  = agora;
      dutyAtual = (uint8_t)ledcRead(PWM_CHANNEL);
      enviarStatus(rpmAtual, dutyAtual);
    }
    if (agora - ultimoKeep >= KEEPALIVE_MS) {
      SerialBT.println("PING:OK");
      ultimoKeep = agora;
    }
  } else {
    ultimoKeep = agora;
  }

  // ── 5. Display ───────────────────────────────────────────────────────────
  dutyAtual = (uint8_t)ledcRead(PWM_CHANNEL);
  if (agora - ultimoRPMDisp >= DISPLAY_RPM_MS) {
    ultimoRPMDisp = agora;
    displayAtualizarRPM(rpmAtual, dutyAtual, modoManual);
  }
  if (agora - ultimoDisplay >= DISPLAY_FULL_MS) {
    ultimoDisplay = agora;
    displayAtualizarInfo();
  }
}
