import React, { useState, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import {
  requestMultiple, request, openSettings,
  PERMISSIONS, RESULTS,
} from 'react-native-permissions';
import bluetoothService from '@/services/bluetooth.service';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MonitorScreen from '@/screens/MonitorScreen';
import ConfigScreen from '@/screens/ConfigScreen';
import CalibrScreen from '@/screens/CalibrScreen';

export type Screen = 'monitor' | 'config' | 'calibr';

async function requestBluetoothPermissions() {
  if (Platform.OS !== 'android') return;

  if ((Platform.Version as number) >= 31) {
    // Android 12+ — usa react-native-permissions (funciona no Android 16)
    const results = await requestMultiple([
      PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
      PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
    ]);
    console.log('[BT Perms]', JSON.stringify(results));

    const vals = Object.values(results);
    if (vals.some(r => r === RESULTS.BLOCKED)) {
      Alert.alert(
        'Bluetooth bloqueado',
        'Habilite o Bluetooth nas configurações do aplicativo.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: () => openSettings().catch(() => {}) },
        ]
      );
    } else if (!vals.every(r => r === RESULTS.GRANTED)) {
      Alert.alert(
        'Permissão necessária',
        'Permita o acesso ao Bluetooth quando solicitado para conectar ao governador.',
      );
    }
  } else {
    // Android 11 e anteriores — Bluetooth clássico exige localização
    const r = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
    console.log('[BT Perms Android <12]', r);
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('monitor');

  useEffect(() => {
    requestBluetoothPermissions().then(() => {
      // Restaura conexão nativa que sobreviveu ao hot reload
      bluetoothService.initialize();
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" hidden />
      {screen === 'monitor' && <MonitorScreen navigate={setScreen} />}
      {screen === 'config'  && <ConfigScreen  navigate={setScreen} />}
      {screen === 'calibr'  && <CalibrScreen  navigate={setScreen} />}
    </SafeAreaProvider>
  );
}
