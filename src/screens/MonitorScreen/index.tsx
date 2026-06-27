import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { useGovernador } from '../../hooks/useGovernador';
import { useDevices } from '../../hooks/useDevices';
import { Screen } from '../../../App';

interface Props {
  navigate: (s: Screen) => void;
}

function Sparkline({ history, setpoint }: { history: number[]; setpoint: number }) {
  const W = 300;
  const H = 80;
  if (history.length < 2) {
    return (
      <View style={{ height: H, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#475569', fontSize: 12 }}>Aguardando dados...</Text>
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
      <Line x1={0} y1={spY} x2={W} y2={spY} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3" />
      <Polyline points={points} fill="none" stroke="#22c55e" strokeWidth={2} />
      <SvgText x={4} y={spY - 4} fill="#f59e0b" fontSize={10}>SP {setpoint}</SvgText>
    </Svg>
  );
}

export default function MonitorScreen({ navigate }: Props) {
  const { data, connected, history, connect, disconnect } = useGovernador();
  const { savedDevice } = useDevices();

  useEffect(() => {
    if (savedDevice && !connected) {
      connect(savedDevice.id).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDevice]);

  const pwmPct = Math.round((data.pwm / 255) * 100);

  const rpmColor = data.rpm >= data.sp * 0.9 ? '#22c55e'
    : data.rpm >= data.sp * 0.7 ? '#f59e0b'
    : '#ef4444';

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GOVERNADOR ELETRÔNICO</Text>
        <View style={[styles.dot, { backgroundColor: connected ? '#22c55e' : '#ef4444' }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Status de conexão */}
        <View style={styles.statusBar}>
          <Text style={[styles.statusText, { color: connected ? '#22c55e' : '#ef4444' }]}>
            {connected
              ? `● ${savedDevice?.name ?? 'Conectado'}`
              : '○ Desconectado'}
          </Text>
          {connected
            ? <TouchableOpacity onPress={disconnect} style={styles.btnSmall}>
                <Text style={styles.btnSmallText}>Desconectar</Text>
              </TouchableOpacity>
            : savedDevice
              ? <TouchableOpacity onPress={() => connect(savedDevice.id)} style={[styles.btnSmall, styles.btnGreen]}>
                  <Text style={styles.btnSmallText}>Reconectar</Text>
                </TouchableOpacity>
              : null
          }
        </View>

        {/* ── Modo ── */}
        <View style={[styles.card, styles.modeCard]}>
          <Text style={styles.cardLabel}>MODO</Text>
          <Text style={[styles.modeText, { color: data.mode === 'AUTO' ? '#38bdf8' : '#fb923c' }]}>
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
            <Text style={[
              styles.errValue,
              { color: Math.abs(data.err) <= 20 ? '#22c55e' : Math.abs(data.err) <= 100 ? '#f59e0b' : '#ef4444' },
            ]}>
              {data.err > 0 ? '+' : ''}{data.err.toFixed(0)} RPM
            </Text>
          </View>
        </View>

        {/* ── Navegação ── */}
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.btnNav} onPress={() => navigate('config')}>
            <Text style={styles.btnNavText}>⚙ Config BT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnNav} onPress={() => navigate('calibr')}>
            <Text style={styles.btnNavText}>🎯 Calibrar</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const CARD_BG = '#1e293b';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scroll: {
    padding: 14,
    gap: 12,
    paddingBottom: 32,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  btnSmall: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#7f1d1d',
    borderRadius: 6,
  },
  btnGreen: { backgroundColor: '#14532d' },
  btnSmallText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
  },
  modeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  cardLabel: {
    color: '#64748b',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
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
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  pwmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  pwmPct: {
    color: '#3b82f6',
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  barBg: {
    height: 16,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: {
    height: 16,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  pwmSub: {
    color: '#475569',
    fontSize: 12,
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
  paramLabel: { color: '#64748b', fontSize: 10, letterSpacing: 1 },
  paramValue: { color: '#f1f5f9', fontSize: 16, fontWeight: '700', marginTop: 2 },
  errRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  errValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  navRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  btnNav: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnNavText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
});
