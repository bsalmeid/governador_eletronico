import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { BluetoothDevice } from 'react-native-bluetooth-classic';
import bluetoothService from '../../services/bluetooth.service';
import { useDevices } from '../../hooks/useDevices';
import { useGovernador } from '../../hooks/useGovernador';
import { Screen } from '../../../App';

interface Props {
  navigate: (s: Screen) => void;
}

export default function ConfigScreen({ navigate }: Props) {
  const [devices, setDevices]       = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning]     = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const { savedDevice, saveDevice, clearDevice } = useDevices();
  const { connected, connect, disconnect }        = useGovernador();

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

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigate('monitor')} style={styles.btnBack}>
          <Text style={styles.btnBackText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CONFIG. BLUETOOTH</Text>
      </View>

      <View style={styles.body}>
        {/* Device atual */}
        {savedDevice && (
          <View style={styles.currentCard}>
            <View style={styles.currentTop}>
              <Text style={styles.currentLabel}>DISPOSITIVO VINCULADO</Text>
              <View style={[styles.dot, { backgroundColor: connected ? '#22c55e' : '#94a3b8' }]} />
            </View>
            <Text style={styles.currentName}>{savedDevice.name}</Text>
            <Text style={styles.currentId}>{savedDevice.id}</Text>
            <View style={styles.currentActions}>
              <Text style={[styles.currentStatus, { color: connected ? '#22c55e' : '#94a3b8' }]}>
                {connected ? 'Online' : 'Offline'}
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
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnScanText}>Buscar Dispositivos Pareados</Text>
          }
        </TouchableOpacity>

        {/* Lista de devices encontrados */}
        {devices.length > 0 && (
          <FlatList
            data={devices}
            keyExtractor={d => d.address}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.name ?? 'Sem nome'}</Text>
                  <Text style={styles.deviceAddr}>{item.address}</Text>
                </View>
                {connecting === item.address
                  ? <ActivityIndicator color="#3b82f6" />
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  title: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  btnBack: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  btnBackText: { color: '#e2e8f0', fontSize: 13 },
  body: { flex: 1, padding: 16, gap: 14 },
  currentCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  currentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  currentLabel: { color: '#64748b', fontSize: 10, letterSpacing: 1.5, fontWeight: '600' },
  currentName: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  currentId: { color: '#64748b', fontSize: 11 },
  currentActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  currentStatus: { fontSize: 13, fontWeight: '500' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  btnScan: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnScanText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  list: { flex: 1 },
  deviceRow: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceInfo: { flex: 1 },
  deviceName: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  deviceAddr: { color: '#64748b', fontSize: 11, marginTop: 2 },
  btnConnect: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnPrimary: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnDanger: {
    backgroundColor: '#b91c1c',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  hint: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 20,
  },
});
