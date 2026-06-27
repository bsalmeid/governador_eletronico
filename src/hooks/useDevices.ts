import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedDevice } from '../types/governador.types';

const KEY = '@governador_device';

export function useDevices() {
  const [savedDevice, setSavedDevice] = useState<SavedDevice | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      if (raw) setSavedDevice(JSON.parse(raw));
    });
  }, []);

  const saveDevice = useCallback(async (dev: SavedDevice) => {
    await AsyncStorage.setItem(KEY, JSON.stringify(dev));
    setSavedDevice(dev);
  }, []);

  const clearDevice = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    setSavedDevice(null);
  }, []);

  return { savedDevice, saveDevice, clearDevice };
}
