import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGovernador } from '../../hooks/useGovernador';
import { Screen } from '../../../App';

// ─── Paleta de alto contraste para uso em alta luminosidade ─────────────────
const C = {
  root:        '#f1f5f9',
  card:        '#ffffff',
  header:      '#1e40af',
  border:      '#e2e8f0',
  borderSep:   '#cbd5e1',
  textPrimary: '#0f172a',
  textLabel:   '#374151',
  textMuted:   '#475569',
  textWhite:   '#ffffff',
  green:       '#15803d',
  amber:       '#b45309',
  red:         '#b91c1c',
  blue:        '#1d4ed8',
  grayBtn:     '#64748b',
  inputBg:     '#ffffff',
  barBg:       '#e2e8f0',
};

interface Props {
  navigate: (s: Screen) => void;
}

type Step = 1 | 2 | 3;

// ─── Passo 1: PPR ────────────────────────────────────────────────────────────

function Step1PPR({ onNext, sendCommand }: {
  onNext: () => void;
  sendCommand: (c: string) => Promise<void>;
}) {
  const [ppr, setPpr]             = useState('20');
  const [detecting, setDetecting] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const autoDetect = useCallback(async () => {
    setDetecting(true);
    setCountdown(3);
    await sendCommand('CALIB:START');
    const iv = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(iv);
          setDetecting(false);
          Alert.alert(
            'Auto-detecção',
            'Insira o RPM real medido com tacômetro externo para que o app calcule o PPR.',
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [sendCommand]);

  const apply = useCallback(async () => {
    const val = parseInt(ppr, 10);
    if (isNaN(val) || val < 1 || val > 200) {
      Alert.alert('Valor inválido', 'PPR deve estar entre 1 e 200.');
      return;
    }
    await sendCommand(`SET_PPR:${val}`);
    await sendCommand('CALIB:END');
    onNext();
  }, [ppr, sendCommand, onNext]);

  return (
    <View style={styles.stepInner}>
      <Text style={styles.stepTitle}>Pulsos por Revolução (PPR)</Text>
      <Text style={styles.stepDesc}>
        Informe quantos pulsos o sensor Hall produz por volta completa do eixo.
        Use 1 para sensor simples (padrão).
      </Text>

      <Text style={styles.fieldLabel}>PPR</Text>
      <TextInput
        style={styles.input}
        value={ppr}
        onChangeText={setPpr}
        keyboardType="number-pad"
        maxLength={3}
        placeholder="1"
        placeholderTextColor={C.textMuted}
      />

      <TouchableOpacity
        style={[styles.btnSecondary, detecting && styles.btnDisabled]}
        onPress={autoDetect}
        disabled={detecting}
      >
        <Text style={styles.btnText}>
          {detecting ? `Contando pulsos... ${countdown}s` : 'Auto-detectar (3 s)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnPrimary} onPress={apply}>
        <Text style={styles.btnText}>Aplicar e Avançar →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Passo 2: PWM Base ───────────────────────────────────────────────────────

function Step2PWMBase({ onNext, onBack, sendCommand, rpm, pwm }: {
  onNext: () => void;
  onBack: () => void;
  sendCommand: (c: string) => Promise<void>;
  rpm: number;
  pwm: number;
}) {
  const [basePwm, setBasePwm]   = useState('200');
  const [setpoint, setSetpoint] = useState('1850');

  const preview = useCallback(async () => {
    await sendCommand(`SET_SP:${setpoint}`);
    await sendCommand(`SET_BASE_PWM:${basePwm}`);
  }, [basePwm, setpoint, sendCommand]);

  const apply = useCallback(async () => {
    const pwmVal = parseInt(basePwm, 10);
    const spVal  = parseInt(setpoint, 10);
    if (isNaN(pwmVal) || pwmVal < 0 || pwmVal > 255) {
      Alert.alert('Valor inválido', 'PWM deve ser entre 0 e 255.');
      return;
    }
    if (isNaN(spVal) || spVal < 1) {
      Alert.alert('Valor inválido', 'Setpoint deve ser maior que 0.');
      return;
    }
    await sendCommand(`SET_SP:${spVal}`);
    await sendCommand(`SET_BASE_PWM:${pwmVal}`);
    onNext();
  }, [basePwm, setpoint, sendCommand, onNext]);

  return (
    <View style={styles.stepInner}>
      <Text style={styles.stepTitle}>Setpoint e PWM Base</Text>
      <Text style={styles.stepDesc}>
        Defina o RPM alvo e o duty cycle para quando o motor operar em plena carga.
        Toque em "Testar" para ver o efeito ao vivo.
      </Text>

      <View style={styles.liveRow}>
        <View style={styles.liveBox}>
          <Text style={styles.liveLabel}>RPM ATUAL</Text>
          <Text style={styles.liveValue}>{rpm.toFixed(0)}</Text>
        </View>
        <View style={styles.liveBox}>
          <Text style={styles.liveLabel}>PWM ATUAL</Text>
          <Text style={styles.liveValue}>{pwm}</Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>Setpoint (RPM)</Text>
      <TextInput
        style={styles.input}
        value={setpoint}
        onChangeText={setSetpoint}
        keyboardType="number-pad"
        maxLength={5}
        placeholder="1000"
        placeholderTextColor={C.textMuted}
      />

      <Text style={styles.fieldLabel}>PWM Base (0–255)</Text>
      <TextInput
        style={styles.input}
        value={basePwm}
        onChangeText={setBasePwm}
        keyboardType="number-pad"
        maxLength={3}
        placeholder="200"
        placeholderTextColor={C.textMuted}
      />

      <TouchableOpacity style={styles.btnSecondary} onPress={preview}>
        <Text style={styles.btnText}>Testar no ESP32</Text>
      </TouchableOpacity>

      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={onBack}>
          <Text style={styles.btnText}>← Voltar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnPrimary, { flex: 2 }]} onPress={apply}>
          <Text style={styles.btnText}>Aplicar e Avançar →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Passo 3: Validação ──────────────────────────────────────────────────────

function Step3Validacao({ onBack, onFinish, sendCommand, data }: {
  onBack: () => void;
  onFinish: () => void;
  sendCommand: (c: string) => Promise<void>;
  data: { rpm: number; sp: number; pwm: number; err: number };
}) {
  const [kp, setKp]             = useState('0.050');
  const [ki, setKi]             = useState('0.010');
  const [kd, setKd]             = useState('0.002');
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [avgDev, setAvgDev]     = useState<number | null>(null);
  const samplesRef              = useRef<number[]>([]);
  const dataRef                 = useRef(data);
  dataRef.current               = data;

  const applyGains = useCallback(async () => {
    const kpV = parseFloat(kp);
    const kiV = parseFloat(ki);
    const kdV = parseFloat(kd);
    if ([kpV, kiV, kdV].some(v => isNaN(v) || v < 0)) {
      Alert.alert('Valor inválido', 'Kp, Ki e Kd devem ser ≥ 0.');
      return;
    }
    await sendCommand(`SET_KP:${kpV.toFixed(4)}`);
    await sendCommand(`SET_KI:${kiV.toFixed(4)}`);
    await sendCommand(`SET_KD:${kdV.toFixed(4)}`);
    await sendCommand('PID:RESET');
  }, [kp, ki, kd, sendCommand]);

  const startValidation = useCallback(async () => {
    setRunning(true);
    setAvgDev(null);
    setProgress(0);
    samplesRef.current = [];
    await sendCommand('CALIB:START');

    const iv = setInterval(() => {
      samplesRef.current.push(dataRef.current.rpm);
      const n = samplesRef.current.length;
      setProgress(n);
      if (n >= 20) {
        clearInterval(iv);
        sendCommand('CALIB:END');
        const avg = samplesRef.current.reduce((a, b) => a + b, 0) / n;
        const sp  = dataRef.current.sp;
        setAvgDev(sp > 0 ? ((avg - sp) / sp) * 100 : 0);
        setRunning(false);
      }
    }, 500);
  }, [sendCommand]);

  const save = useCallback(async () => {
    await sendCommand('SAVE');
    Alert.alert('Salvo!', 'Configuração gravada na EEPROM do ESP32.');
    onFinish();
  }, [sendCommand, onFinish]);

  const devColor = avgDev === null ? C.textMuted
    : Math.abs(avgDev) <= 5  ? C.green
    : Math.abs(avgDev) <= 15 ? C.amber
    : C.red;

  const errColor = Math.abs(data.err) <= 20 ? C.green
    : Math.abs(data.err) <= 100 ? C.amber : C.red;

  return (
    <View style={styles.stepInner}>
      <Text style={styles.stepTitle}>Validação e Ajuste do PID</Text>
      <Text style={styles.stepDesc}>
        Configure Kp, Ki e Kd e aplique. Rode a validação de 10 s para medir o desvio
        médio. Objetivo: desvio {'<'} 5% e erro ao vivo próximo de zero.
      </Text>

      <View style={styles.liveRow}>
        <View style={styles.liveBox}>
          <Text style={styles.liveLabel}>RPM ATUAL</Text>
          <Text style={styles.liveValue}>{data.rpm.toFixed(0)}</Text>
        </View>
        <View style={styles.liveBox}>
          <Text style={styles.liveLabel}>ERRO AO VIVO</Text>
          <Text style={[styles.liveValue, { color: errColor }]}>
            {data.err > 0 ? '+' : ''}{data.err.toFixed(0)}
          </Text>
        </View>
        <View style={styles.liveBox}>
          <Text style={styles.liveLabel}>DESVIO MÉD.</Text>
          <Text style={[styles.liveValue, { color: devColor }]}>
            {avgDev !== null ? `${avgDev.toFixed(1)}%` : '—'}
          </Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>Kp — Proporcional (reação imediata)</Text>
      <TextInput
        style={styles.input}
        value={kp}
        onChangeText={setKp}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="0.050"
        placeholderTextColor={C.textMuted}
      />

      <Text style={styles.fieldLabel}>Ki — Integral (zera erro em regime permanente)</Text>
      <TextInput
        style={styles.input}
        value={ki}
        onChangeText={setKi}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="0.010"
        placeholderTextColor={C.textMuted}
      />

      <Text style={styles.fieldLabel}>Kd — Derivativo (amorte oscilações)</Text>
      <TextInput
        style={styles.input}
        value={kd}
        onChangeText={setKd}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="0.002"
        placeholderTextColor={C.textMuted}
      />

      <TouchableOpacity style={styles.btnSecondary} onPress={applyGains}>
        <Text style={styles.btnText}>Aplicar Kp / Ki / Kd no ESP32</Text>
      </TouchableOpacity>

      {running && (
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${(progress / 20) * 100}%` }]} />
        </View>
      )}

      <TouchableOpacity
        style={[styles.btnSecondary, running && styles.btnDisabled]}
        onPress={startValidation}
        disabled={running}
      >
        <Text style={styles.btnText}>
          {running ? `Validando... ${progress}/20` : 'Iniciar Validação (10 s)'}
        </Text>
      </TouchableOpacity>

      {avgDev !== null && (
        <Text style={[styles.devHint, { color: devColor }]}>
          {Math.abs(avgDev) <= 5
            ? '✓ Excelente — pode salvar.'
            : Math.abs(avgDev) <= 15
              ? '⚠ Ajuste os ganhos e valide novamente.'
              : '✗ Desvio alto — revise PPR, PWM Base e reduza Kp.'}
        </Text>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={onBack}>
          <Text style={styles.btnText}>← Voltar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnPrimary, { flex: 2 }]} onPress={save}>
          <Text style={styles.btnText}>Salvar na EEPROM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────

export default function CalibrScreen({ navigate }: Props) {
  const [step, setStep]                      = useState<Step>(1);
  const { data, sendCommand, connected }     = useGovernador();
  const insets                               = useSafeAreaInsets();

  if (!connected) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={[styles.stepDesc, { textAlign: 'center', marginBottom: 20 }]}>
          ESP32 não conectado.{'\n'}Conecte o dispositivo antes de calibrar.
        </Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => navigate('config')}>
          <Text style={styles.btnText}>Ir para Config. Bluetooth</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigate('monitor')} style={styles.btnBack}>
          <Text style={styles.btnBackText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CALIBRAÇÃO</Text>
        <View style={styles.stepDots}>
          {([1, 2, 3] as Step[]).map(s => (
            <View key={s} style={[styles.dot, step === s && styles.dotActive]}>
              <Text style={styles.dotText}>{s}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}
      >
        {step === 1 && (
          <Step1PPR
            sendCommand={sendCommand}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2PWMBase
            sendCommand={sendCommand}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
            rpm={data.rpm}
            pwm={data.pwm}
          />
        )}
        {step === 3 && (
          <Step3Validacao
            sendCommand={sendCommand}
            onBack={() => setStep(2)}
            onFinish={() => navigate('monitor')}
            data={{ rpm: data.rpm, sp: data.sp, pwm: data.pwm, err: data.err }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.root },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    backgroundColor: C.header,
  },
  headerTitle: {
    flex: 1,
    color: C.textWhite,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  btnBack: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  btnBackText: { color: C.textWhite, fontSize: 13, fontWeight: '600' },
  stepDots: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: { backgroundColor: C.textWhite },
  dotText: { color: C.header, fontSize: 13, fontWeight: '800' },
  scroll: { padding: 20, gap: 0 },
  stepInner: { gap: 14 },
  stepTitle: { color: C.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  stepDesc: { color: C.textMuted, fontSize: 13, lineHeight: 20 },
  fieldLabel: {
    color: C.textLabel,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700',
    marginTop: 4,
  },
  input: {
    backgroundColor: C.inputBg,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.borderSep,
    color: C.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  liveRow: { flexDirection: 'row', gap: 10 },
  liveBox: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  liveLabel: { color: C.textLabel, fontSize: 10, letterSpacing: 1, fontWeight: '600', marginBottom: 4 },
  liveValue: { color: C.green, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressBg: {
    height: 8,
    backgroundColor: C.barBg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: 8, backgroundColor: C.blue, borderRadius: 4 },
  btnPrimary: {
    backgroundColor: C.blue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: C.grayBtn,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: C.textWhite, fontSize: 14, fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  devHint: { fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
