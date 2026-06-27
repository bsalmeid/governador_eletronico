import React, { useState, useEffect } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import bluetoothService from '@/services/bluetooth.service';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MonitorScreen from '@/screens/MonitorScreen';
import ConfigScreen from '@/screens/ConfigScreen';
import CalibrScreen from '@/screens/CalibrScreen';

export type Screen = 'monitor' | 'config' | 'calibr';

async function requestBluetoothPermissions() {
  if (Platform.OS !== 'android') return;

  if (Platform.Version >= 31) {
    // Android 12+
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);
    console.log('[BT Perms Android 12+]', JSON.stringify(result));
    const denied = Object.entries(result).filter(
      ([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED
    );
    if (denied.length > 0) {
      Alert.alert(
        'Permissão necessária',
        'Acesse Configurações > Aplicativos > Governador > Permissões e habilite o Bluetooth.',
      );
    }
  } else {
    // Android 11 e anteriores
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Localização necessária para Bluetooth',
        message: 'O Android requer permissão de localização para buscar dispositivos Bluetooth.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Negar',
      }
    );
    console.log('[BT Perms Android <12]', result);
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
