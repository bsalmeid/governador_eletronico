import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, TextInput, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BluetoothDevice } from 'react-native-bluetooth-classic';
import bluetoothService from '../../services/bluetooth.service';
import { useDevices } from '../../hooks/useDevices';
import { useGovernador } from '../../hooks/useGovernador';
import { Screen } from '../../../App';

// ─── Paleta de alto contraste para uso em alta luminosidade ─────────────────
const C = {
  root:        '#f1f5f9',
  card:        '#ffffff',
  header:      '#1e40af',
  border:      '#e2e8f0',
  textPrimary: '#0f172a',
  textLabel:   '#374151',
  textMuted:   '#475569',
  textWhite:   '#ffffff',
  green:       '#15803d',
  red:         '#b91c1c',
  blue:        '#1d4ed8',
  grayMid:     '#64748b',
};

interface Props {
  navigate: (s: Screen) => void;
}

export default function ConfigScreen({ navigate }: Props) {
  const [devices, setDevices]       = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning]     = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const [rpmMin, setRpmMin] = useState('');

  const { savedDevice, saveDevice, clearDevice } = useDevices();
  const { data, connected, connect, disconnect, sendCommand } = useGovernador();
  const insets = useSafeAreaInsets();

  const scan = useCallback(async () => {
    setScanning(true);
    setDevices([]);
    try {
      const found = await bluetoothService.scanDevices();
      setDevices(found);
    } catch (err: any) {
      Alert.alert('Bluetooth', err.message ?? 'Erro ao buscar dispositivos');
    } finally {
      setScanning(false);
    }
  }, []);

  const handleConnect = useCallback(async (dev: BluetoothDevice) => {
    setConnecting(dev.address);
    try {
      await connect(dev.address);
      await saveDevice({ id: dev.address, name: dev.name ?? dev.address });
      Alert.alert('Conectado', `Vinculado a ${dev.name ?? dev.address}`);
    } catch {
      Alert.alert('Erro', 'Não foi possível conectar ao dispositivo.');
    } finally {
      setConnecting(null);
    }
  }, [connect, saveDevice]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    await clearDevice();
  }, [disconnect, clearDevice]);

  useEffect(() => {
    if (data.rpmMin !== undefined && rpmMin === '') {
      setRpmMin(String(data.rpmMin));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.rpmMin]);

  const applyRpmMin = useCallback(async () => {
    const val = parseInt(rpmMin, 10);
    if (isNaN(val) || val < 100 || val > 5000) {
      Alert.alert('Valor inválido', 'RPM mínimo deve ser entre 100 e 5000.');
      return;
    }
    await sendCommand(`SET_RPM_MIN:${val}`);
    await sendCommand('SAVE');
    Alert.alert('Salvo', `RPM mínimo definido: ${val} RPM`);
  }, [rpmMin, sendCommand]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigate('monitor')} style={styles.btnBack}>
          <Text style={styles.btnBackText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CONFIG. BLUETOOTH</Text>
      </View>

      <View style={styles.body}>

        {/* Device vinculado */}
        {savedDevice && (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardLabel}>DISPOSITIVO VINCULADO</Text>
              <View style={[
                styles.dot,
                { backgroundColor: connected ? C.green : C.grayMid },
              ]} />
            </View>
            <Text style={styles.deviceName}>{savedDevice.name}</Text>
            <Text style={styles.deviceAddr}>{savedDevice.id}</Text>
            <View style={styles.cardActions}>
              <Text style={[styles.statusText, { color: connected ? C.green : C.grayMid }]}>
                {connected ? '● Online' : '○ Offline'}
              </Text>
              {connected
                ? <TouchableOpacity style={styles.btnDanger} onPress={handleDisconnect}>
                    <Text style={styles.btnText}>Desconectar</Text>
                  </TouchableOpacity>
                : <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={() => handleConnect({ address: savedDevice.id, name: savedDevice.name } as BluetoothDevice)}
                  >
                    <Text style={styles.btnText}>Reconectar</Text>
                  </TouchableOpacity>
              }
            </View>
          </View>
        )}

        {/* Botão scan */}
        <TouchableOpacity style={styles.btnScan} onPress={scan} disabled={scanning}>
          {scanning
            ? <ActivityIndicator color={C.textWhite} />
            : <Text style={styles.btnScanText}>Buscar Dispositivos Pareados</Text>
          }
        </TouchableOpacity>

        {/* Lista de devices */}
        {devices.length > 0 && (
          <FlatList
            data={devices}
            keyExtractor={d => d.address}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceRowName}>{item.name ?? 'Sem nome'}</Text>
                  <Text style={styles.deviceRowAddr}>{item.address}</Text>
                </View>
                {connecting === item.address
                  ? <ActivityIndicator color={C.blue} />
                  : <TouchableOpacity
                      style={styles.btnConnect}
                      onPress={() => handleConnect(item)}
                    >
                      <Text style={styles.btnText}>Conectar</Text>
                    </TouchableOpacity>
                }
              </View>
            )}
          />
        )}

        {devices.length === 0 && !scanning && (
          <Text style={styles.hint}>
            Pareie o ESP32 nas configurações de Bluetooth do Android e depois toque em "Buscar".
          </Text>
        )}

        {/* Card: RPM mínimo de segurança */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>PROTEÇÃO — RPM MÍNIMO</Text>
          <Text style={styles.hintCard}>
            Abaixo deste valor por 2 s contínuos o atuador é desligado automaticamente.
          </Text>
          <TextInput
            style={styles.input}
            value={rpmMin}
            onChangeText={setRpmMin}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="1000"
            placeholderTextColor={C.textMuted}
          />
          <TouchableOpacity
            style={[styles.btnPrimary, !connected && { opacity: 0.4 }]}
            onPress={applyRpmMin}
            disabled={!connected}
          >
            <Text style={styles.btnText}>Aplicar e Salvar na EEPROM</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.root },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    backgroundColor: C.header,
  },
  title: { color: C.textWhite, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  btnBack: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  btnBackText: { color: C.textWhite, fontSize: 13, fontWeight: '600' },
  body: { flex: 1, padding: 16, gap: 14 },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardLabel: { color: C.textLabel, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
  },
  deviceName: { color: C.textPrimary, fontSize: 18, fontWeight: '700' },
  deviceAddr: { color: C.textMuted, fontSize: 11 },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  statusText: { fontSize: 13, fontWeight: '600' },
  btnScan: {
    backgroundColor: C.blue,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnScanText: { color: C.textWhite, fontSize: 15, fontWeight: '700' },
  list: { flex: 1 },
  deviceRow: {
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  deviceInfo: { flex: 1 },
  deviceRowName: { color: C.textPrimary, fontSize: 15, fontWeight: '600' },
  deviceRowAddr: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  btnConnect: {
    backgroundColor: C.blue,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnPrimary: {
    backgroundColor: C.green,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnDanger: {
    backgroundColor: C.red,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnText: { color: C.textWhite, fontSize: 13, fontWeight: '700' },
  hint: {
    color: C.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 20,
  },
  hintCard: {
    color: C.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    color: C.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: '600',
  },
});
