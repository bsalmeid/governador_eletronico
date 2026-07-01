#pragma once

// ============================================================================
// globals.h — Governador Eletrônico ESP32
// Pinos, constantes e tipos compartilhados entre módulos do sketch.
// ============================================================================

#include <Arduino.h>
#include <EEPROM.h>
#include <BluetoothSerial.h>
#include <TFT_eSPI.h>
#include <esp_bt.h>
#include <esp_gap_bt_api.h>

// ─── Pinos ──────────────────────────────────────────────────────────────────

// H-Bridge BTS7960 (ou similar)
static const uint8_t PWM_PIN  = 25;   // R_PWM — sinal PWM para a ponte H
static const uint8_t EN_PIN   = 27;   // R_EN  — enable sempre HIGH
static const uint8_t ISENSE_PIN = 32; // R_IS  — leitura de corrente (opcional)

// Controles do operador
static const uint8_t POT_PIN       = 34;  // potenciômetro 10 k — ADC1_CH6
static const uint8_t MODE_PIN      = 13;  // chave MANUAL(LOW) / AUTO(HIGH) — INPUT_PULLDOWN

// Sensor Hall / indutivo NPN
static const uint8_t HALL_PIN = 33;  // pulso a cada passagem de dente/ima — INPUT_PULLUP, borda FALLING

// Display ILI9341 via TFT_eSPI (configurado em User_Setup.h)
// CS=21  RST=4  DC=16  MOSI=23  SCK=18  MISO=19

// ─── PWM ────────────────────────────────────────────────────────────────────

static const uint8_t  PWM_CHANNEL    = 0;
static const uint32_t PWM_FREQ_HZ    = 20000; // 20 kHz — acima da audição humana
static const uint8_t  PWM_RESOLUTION = 8;     // 0-255

// ─── Temporização ───────────────────────────────────────────────────────────

static const uint32_t RPM_INTERVAL_MS      = 200;   // janela de contagem de pulsos
static const uint32_t BT_STATUS_MS         = 500;   // telemetria normal
static const uint32_t BT_CALIB_MS          = 100;   // telemetria em modo calibração
static const uint32_t DISPLAY_FULL_MS      = 1000;  // atualização completa do display
static const uint32_t DISPLAY_RPM_MS       = 250;   // atualização do RPM no display
static const uint32_t KEEPALIVE_MS         = 3000;  // PING:OK para manter conexão BT viva

// ─── EEPROM ─────────────────────────────────────────────────────────────────

static const int EEPROM_SIZE  = 64;
static const int EEPROM_MAGIC = 0;   // byte de validade (valor esperado: 0xA5)
static const int EEPROM_CFG   = 1;   // início da struct Config

static const uint8_t EEPROM_MAGIC_VAL = 0xA8; // incrementar sempre que Config mudar de tamanho

// ─── Temporização de proteção ────────────────────────────────────────────────

static const uint32_t RPM_MIN_TIMEOUT_MS = 2000; // ms abaixo do mínimo antes de acionar falha

// ─── Struct de configuração persistível ─────────────────────────────────────

struct Config {
  uint8_t  ppr;             // pulsos por revolução do sensor Hall (padrão: 1)
  uint16_t setpointRPM;     // RPM alvo no modo AUTO (padrão: 1000)
  uint8_t  basePWM;         // duty cycle em RPM nominal (padrão: 200) // CONFIRMAR no LOCAL... colocar o trator a 1.000 RPM e medir o duty cycle do PWM, colocar esse valor aqui // MEDIR VOLTAGEM da Valcula Atual
  float    Kp;              // ganho proporcional  — reage ao erro atual
  float    Ki;              // ganho integral      — elimina erro em regime permanente
  float    Kd;              // ganho derivativo    — amorte oscilações em mudanças bruscas
  uint8_t  minPWM;          // duty mínimo em modo AUTO (padrão: 50)
  uint8_t  maxPWM;          // duty máximo (padrão: 255)
  char     btName[24];      // nome Bluetooth (padrão: "ESP32_GOVERNADOR")
  uint16_t rpmMinSeguranca; // RPM mínimo de segurança — abaixo por RPM_MIN_TIMEOUT_MS zera PWM
};

// Defaults para roda fônica de 20 dentes, eixo ~1850 RPM.
// Frequência máx. de pulsos: 1850/60 × 20 ≈ 617 Hz (1 pulso a cada 1,62 ms).
// Resolução na janela de 200 ms: ±15 RPM por pulso (~0,8%).
// Kp/Ki/Kd conservadores — ajustar via app após validação em bancada.
// Inicialização posicional (C++11 compatível com toolchain Arduino).
static const Config CFG_DEFAULT = {
  20,                  // ppr
  1850,                // setpointRPM
  200,                 // basePWM
  0.05f,               // Kp
  0.01f,               // Ki
  0.002f,              // Kd
  50,                  // minPWM
  255,                 // maxPWM
  "ESP32_GOVERNADOR",  // btName
  1000                 // rpmMinSeguranca
};

// ─── Declarações externas (definidas no .ino) ────────────────────────────────

extern BluetoothSerial SerialBT;
extern TFT_eSPI        tft;
extern Config          cfg;
extern volatile uint32_t hallPulses;
extern float           rpmAtual;
extern float           pwmSuave;
extern bool            modoManual;
extern bool            modoCalib;
