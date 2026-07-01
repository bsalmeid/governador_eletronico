import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { useGovernador } from '../../hooks/useGovernador';
import { useDevices } from '../../hooks/useDevices';
import { Screen } from '../../../App';

// ─── Paleta de alto contraste para uso em alta luminosidade ─────────────────
const C = {
  // Fundos
  root:       '#f1f5f9',
  card:       '#ffffff',
  header:     '#1e40af',
  footer:     '#1e40af',
  barBg:      '#e2e8f0',

  // Texto
  textPrimary: '#0f172a',
  textLabel:   '#374151',
  textMuted:   '#475569',
  textWhite:   '#ffffff',

  // Bordas
  border:     '#e2e8f0',
  borderSep:  '#cbd5e1',

  // Status operacional
  green:      '#15803d',
  amber:      '#b45309',
  red:        '#b91c1c',

  // Acento
  blue:       '#1d4ed8',
  orange:     '#c2410c',
};

interface Props {
  navigate: (s: Screen) => void;
}

function Sparkline({ history, setpoint }: { history: number[]; setpoint: number }) {
  const W = 300;
  const H = 80;
  if (history.length < 2) {
    return (
      <View style={{ height: H, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.textMuted, fontSize: 12 }}>Aguardando dados...</Text>
      </View>
    );
  }
  const max = Math.max(...history, setpoint * 1.2, 100);
  const points = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * W;
      const y = H - (v / max) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const spY = H - (setpoint / max) * H;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={0} y1={spY} x2={W} y2={spY} stroke={C.amber} strokeWidth={1.5} strokeDasharray="4,3" />
      <Polyline points={points} fill="none" stroke={C.green} strokeWidth={2.5} />
      <SvgText x={4} y={spY - 4} fill={C.amber} fontSize={10} fontWeight="700">SP {setpoint}</SvgText>
    </Svg>
  );
}

export default function MonitorScreen({ navigate }: Props) {
  const { data, connected, history, connect, disconnect } = useGovernador();
  const { savedDevice } = useDevices();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (savedDevice && !connected) {
      connect(savedDevice.id).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDevice]);

  const pwmPct = Math.round((data.pwm / 255) * 100);

  const rpmColor = data.rpm >= data.sp * 0.9 ? C.green
    : data.rpm >= data.sp * 0.7 ? C.amber
    : C.red;

  const errColor = Math.abs(data.err) <= 20 ? C.green
    : Math.abs(data.err) <= 100 ? C.amber
    : C.red;

  return (
    <View style={styles.root}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GOVERNADOR ELETRÔNICO</Text>
        <View style={[styles.dot, { backgroundColor: connected ? C.green : C.red }]} />
      </View>

      {/* ── Banner de falha ── */}
      {data.fault === 1 && (
        <View style={styles.faultBanner}>
          <Text style={styles.faultText}>⚠ FALHA: RPM ABAIXO DO MÍNIMO — ATUADOR DESLIGADO</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Status de conexão */}
        <View style={styles.statusBar}>
          <Text style={[styles.statusText, { color: connected ? C.green : C.red }]}>
            {connected
              ? `● ${savedDevice?.name ?? 'Conectado'}`
              : '○ Desconectado'}
          </Text>
          {connected
            ? <TouchableOpacity onPress={disconnect} style={styles.btnDanger}>
                <Text style={styles.btnSmallText}>Desconectar</Text>
              </TouchableOpacity>
            : savedDevice
              ? <TouchableOpacity onPress={() => connect(savedDevice.id)} style={styles.btnSuccess}>
                  <Text style={styles.btnSmallText}>Reconectar</Text>
                </TouchableOpacity>
              : null
          }
        </View>

        {/* ── Modo ── */}
        <View style={[styles.card, styles.modeCard]}>
          <Text style={styles.cardLabel}>MODO</Text>
          <Text style={[styles.modeText, { color: data.mode === 'AUTO' ? C.blue : C.orange }]}>
            {data.mode}
          </Text>
        </View>

        {/* ── RPM ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>RPM ATUAL</Text>
          <Text style={[styles.rpmValue, { color: rpmColor }]}>
            {data.rpm.toFixed(0)}
          </Text>
          <Text style={styles.setpointText}>Setpoint: {data.sp} RPM</Text>
        </View>

        {/* ── PWM ── */}
        <View style={styles.card}>
          <View style={styles.pwmHeader}>
            <Text style={styles.cardLabel}>POTÊNCIA PWM</Text>
            <Text style={styles.pwmPct}>{pwmPct}%</Text>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${pwmPct}%` }]} />
          </View>
          <Text style={styles.pwmSub}>{data.pwm} / 255</Text>
        </View>

        {/* ── Gráfico RPM ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>HISTÓRICO RPM (30 amostras)</Text>
          <Sparkline history={history} setpoint={data.sp} />
        </View>

        {/* ── Parâmetros ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PARÂMETROS</Text>
          <View style={styles.paramGrid}>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>PPR</Text>
              <Text style={styles.paramValue}>{data.ppr}</Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>Kp</Text>
              <Text style={styles.paramValue}>{data.kp.toFixed(3)}</Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>Ki</Text>
              <Text style={styles.paramValue}>{data.ki.toFixed(3)}</Text>
            </View>
            <View style={styles.paramItem}>
              <Text style={styles.paramLabel}>Kd</Text>
              <Text style={styles.paramValue}>{data.kd.toFixed(3)}</Text>
            </View>
          </View>
          <View style={styles.errRow}>
            <Text style={styles.paramLabel}>ERRO ATUAL</Text>
            <Text style={[styles.errValue, { color: errColor }]}>
              {data.err > 0 ? '+' : ''}{data.err.toFixed(0)} RPM
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* ── Footer fixo ── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.btnNav} onPress={() => navigate('config')}>
          <Text style={styles.btnNavText}>⚙ Config BT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnNav} onPress={() => navigate('calibr')}>
          <Text style={styles.btnNavText}>🎯 Calibrar</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.root,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    backgroundColor: C.header,
  },
  headerTitle: {
    color: C.textWhite,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  faultBanner: {
    backgroundColor: C.red,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  faultText: {
    color: C.textWhite,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scroll: {
    padding: 14,
    gap: 12,
    paddingBottom: 12,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnDanger: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.red,
    borderRadius: 6,
  },
  btnSuccess: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.green,
    borderRadius: 6,
  },
  btnSmallText: { color: C.textWhite, fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  cardLabel: {
    color: C.textLabel,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  modeText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
  },
  rpmValue: {
    fontSize: 72,
    fontWeight: '700',
    lineHeight: 80,
    fontVariant: ['tabular-nums'],
  },
  setpointText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  pwmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  pwmPct: {
    color: C.blue,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  barBg: {
    height: 16,
    backgroundColor: C.barBg,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: {
    height: 16,
    backgroundColor: C.blue,
    borderRadius: 8,
  },
  pwmSub: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'right',
  },
  paramGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  paramItem: { alignItems: 'center', minWidth: 60 },
  paramLabel: { color: C.textLabel, fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  paramValue: { color: C.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 2 },
  errRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.borderSep,
  },
  errValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: C.footer,
  },
  btnNav: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  btnNavText: {
    color: C.textWhite,
    fontSize: 13,
    fontWeight: '700',
  },
});
