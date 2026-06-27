import { useState, useEffect, useCallback } from 'react';
import bluetoothService from '../services/bluetooth.service';
import { GovernadorData } from '../types/governador.types';

const HISTORY_MAX = 30;

const DATA_EMPTY: GovernadorData = {
  rpm: 0, sp: 1850, pwm: 0, mode: 'MANUAL', pot: 0, ppr: 20,
  kp: 0.05, ki: 0.01, kd: 0.002, err: 0,
};

export function useGovernador() {
  // Inicializa com o último dado do service (evita tela em branco ao navegar entre telas)
  const [data, setData]           = useState<GovernadorData>(bluetoothService.getLastData() ?? DATA_EMPTY);
  const [connected, setConnected] = useState(bluetoothService.isConnected());
  const [error, setError]         = useState<string | null>(null);
  const [history, setHistory]     = useState<number[]>([]);

  useEffect(() => {
    // Registra callbacks: 'd' é GovernadorData (objeto já parseado pelo service)
    // O JSON.parse ocorre em bluetooth.service.ts → handleRawData → parseJson
    bluetoothService.setCallbacks({
      onData: (d) => {
        setData(d);
        setHistory(prev => [...prev.slice(-(HISTORY_MAX - 1)), d.rpm]);
      },
      onStatus: (c) => {
        console.log('[BT] connected=' + c);
        setConnected(c);
        if (!c) setHistory([]);
      },
      onError: (e) => {
        console.error('[BT] error:', e);
        setError(e);
      },
    });

    // Limpa callbacks ao desmontar — próxima tela registrará os seus
    return () => {
      bluetoothService.setCallbacks({});
    };
  }, []);

  const sendCommand = useCallback(async (cmd: string) => {
    await bluetoothService.send(cmd);
  }, []);

  const connect = useCallback(async (address: string) => {
    setError(null);
    await bluetoothService.connect(address);
  }, []);

  const disconnect = useCallback(async () => {
    await bluetoothService.disconnect();
  }, []);

  return { data, connected, error, history, sendCommand, connect, disconnect };
}
