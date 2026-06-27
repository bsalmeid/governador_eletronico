import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useGovernador } from '../../hooks/useGovernador';
import { Screen } from '../../../App';

interface Props {
  navigate: (s: Screen) => void;
}

type Step = 1 | 2 | 3;

// ─── Passo 1: PPR ────────────────────────────────────────────────────────────

function Step1PPR({ onNext, sendCommand }: {
  onNext: () => void;
  sendCommand: (c: string) => Promise<void>;
}) {
  const [ppr, setPpr]           = useState('20');
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
        placeholderTextColor="#475569"
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

      {/* Valores ao vivo */}
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
        placeholderTextColor="#475569"
      />

      <Text style={styles.fieldLabel}>PWM Base (0–255)</Text>
      <TextInput
        style={styles.input}
        value={basePwm}
        onChangeText={setBasePwm}
        keyboardType="number-pad"
        maxLength={3}
        placeholder="200"
        placeholderTextColor="#475569"
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

  const devColor = avgDev === null ? '#94a3b8'
    : Math.abs(avgDev) <= 5  ? '#22c55e'
    : Math.abs(avgDev) <= 15 ? '#f59e0b'
    : '#ef4444';

  const errColor = Math.abs(data.err) <= 20 ? '#22c55e'
    : Math.abs(data.err) <= 100 ? '#f59e0b' : '#ef4444';

  return (
    <View style={styles.stepInner}>
      <Text style={styles.stepTitle}>Validação e Ajuste do PID</Text>
      <Text style={styles.stepDesc}>
        Configure Kp, Ki e Kd e aplique. Rode a validação de 10 s para medir o desvio
        médio. Objetivo: desvio {'<'} 5% e erro ao vivo próximo de zero.
      </Text>

      {/* Valores ao vivo */}
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

      {/* Campos PID */}
      <Text style={styles.fieldLabel}>Kp — Proporcional (reação imediata)</Text>
      <TextInput
        style={styles.input}
        value={kp}
        onChangeText={setKp}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="0.050"
        placeholderTextColor="#475569"
      />

      <Text style={styles.fieldLabel}>Ki — Integral (zera erro em regime permanente)</Text>
      <TextInput
        style={styles.input}
        value={ki}
        onChangeText={setKi}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="0.010"
        placeholderTextColor="#475569"
      />

      <Text style={styles.fieldLabel}>Kd — Derivativo (amorte oscilações)</Text>
      <TextInput
        style={styles.input}
        value={kd}
        onChangeText={setKd}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder="0.002"
        placeholderTextColor="#475569"
      />

      <TouchableOpacity style={styles.btnSecondary} onPress={applyGains}>
        <Text style={styles.btnText}>Aplicar Kp / Ki / Kd no ESP32</Text>
      </TouchableOpacity>

      {/* Barra de progresso */}
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
  const [step, setStep]            = useState<Step>(1);
  const { data, sendCommand, connected } = useGovernador();

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
        contentContainerStyle={styles.scroll}
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
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  btnBack: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#334155', borderRadius: 8 },
  btnBackText: { color: '#e2e8f0', fontSize: 13 },
  stepDots: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: { backgroundColor: '#1d4ed8' },
  dotText: { color: '#f1f5f9', fontSize: 13, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 40, gap: 0 },
  stepInner: { gap: 14 },
  stepTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  stepDesc: { color: '#94a3b8', fontSize: 13, lineHeight: 20 },
  fieldLabel: { color: '#64748b', fontSize: 11, letterSpacing: 1, fontWeight: '600', marginTop: 4 },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  liveRow: { flexDirection: 'row', gap: 10 },
  liveBox: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  liveLabel: { color: '#64748b', fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  liveValue: { color: '#22c55e', fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressBg: {
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: 8, backgroundColor: '#3b82f6', borderRadius: 4 },
  btnPrimary: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  devHint: { fontSize: 13, textAlign: 'center', fontWeight: '500' },
});
