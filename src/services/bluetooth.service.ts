import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
import { Platform, Alert } from 'react-native';
import {
  check, checkMultiple, request, requestMultiple, openSettings,
  PERMISSIONS, RESULTS,
} from 'react-native-permissions';
import { GovernadorData } from '../types/governador.types';

type DataCallback    = (data: GovernadorData) => void;
type StatusCallback  = (connected: boolean) => void;
type ErrorCallback   = (err: string) => void;

// ─── Singleton ───────────────────────────────────────────────────────────────

let device: BluetoothDevice | null = null;
let lineBuffer = '';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 3;

let lastData: GovernadorData | null = null;

let onData:   DataCallback   | null = null;
let onStatus: StatusCallback | null = null;
let onError:  ErrorCallback  | null = null;

let dataSubscription:       any = null;
let disconnectSubscription: any = null;

// ─── Helpers internos ────────────────────────────────────────────────────────

function parseJson(raw: string): GovernadorData | null {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.rpm === 'number') return obj as GovernadorData;
    return null;
  } catch {
    return null;
  }
}

function handleRawData(raw: string) {
  lineBuffer += raw;

  // Extrai objetos JSON completos contando chaves { } — não depende de '\n'
  // Funciona mesmo quando onDataReceived dispara em múltiplos chunks sem newline
  let depth = 0;
  let start = -1;
  let consumed = 0;

  for (let i = 0; i < lineBuffer.length; i++) {
    const ch = lineBuffer[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = lineBuffer.slice(start, i + 1);
        const parsed = parseJson(candidate);
        if (parsed) {
          lastData = parsed;
          onData?.(parsed);
        }
        consumed = i + 1;
        start = -1;
      }
    }
  }

  // Mantém apenas o trecho ainda incompleto
  lineBuffer = lineBuffer.slice(consumed);
}

function subscribeEvents() {
  dataSubscription = device?.onDataReceived((event: { data: string }) => {
    handleRawData(event.data);
  });
  disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected(() => {
    onStatus?.(false);
    scheduleReconnect();
  });
}

function unsubscribeEvents() {
  dataSubscription?.remove();
  disconnectSubscription?.remove();
  dataSubscription       = null;
  disconnectSubscription = null;
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT || !device) return;
  reconnectTimer = setTimeout(async () => {
    reconnectAttempts++;
    try {
      await bluetoothService.connect(device!.address);
    } catch {
      scheduleReconnect();
    }
  }, 2000);
}

async function hasBtPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if ((Platform.Version as number) < 31) {
    const r = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
    return r === RESULTS.GRANTED;
  }
  const results = await checkMultiple([
    PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
    PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
  ]);
  const vals = Object.values(results);
  console.log('[BT] check CONNECT=' + results[PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]
    + ' SCAN=' + results[PERMISSIONS.ANDROID.BLUETOOTH_SCAN]);
  return vals.every(r => r === RESULTS.GRANTED);
}

async function requestBtPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if ((Platform.Version as number) < 31) {
    const r = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
    return r === RESULTS.GRANTED;
  }
  const results = await requestMultiple([
    PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
    PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
  ]);
  const vals = Object.values(results);
  console.log('[BT] request CONNECT=' + results[PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]
    + ' SCAN=' + results[PERMISSIONS.ANDROID.BLUETOOTH_SCAN]);

  if (vals.some(r => r === RESULTS.BLOCKED)) {
    Alert.alert(
      'Bluetooth bloqueado',
      'A permissão foi negada permanentemente. Habilite nas configurações do aplicativo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Configurações', onPress: () => openSettings().catch(() => {}) },
      ]
    );
    return false;
  }
  return vals.every(r => r === RESULTS.GRANTED);
}

// ─── API pública ─────────────────────────────────────────────────────────────

const bluetoothService = {
  setCallbacks(opts: {
    onData?:   DataCallback;
    onStatus?: StatusCallback;
    onError?:  ErrorCallback;
  }) {
    onData   = opts.onData   ?? null;
    onStatus = opts.onStatus ?? null;
    onError  = opts.onError  ?? null;
  },

  async scanDevices(): Promise<BluetoothDevice[]> {
    try {
      console.log('[BT] scanDevices — API', Platform.Version);

      // Checar permissões sem dialog primeiro (evita trava no hot reload)
      const already = await hasBtPermissions();
      console.log('[BT] permissões já concedidas =', already);

      if (!already) {
        const granted = await requestBtPermissions();
        if (!granted) {
          throw new Error('Permissão Bluetooth negada. Habilite nas configurações do app.');
        }
      }

      console.log('[BT] verificando BT ligado...');
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      console.log('[BT] isBluetoothEnabled =', enabled);
      if (!enabled) {
        throw new Error('Bluetooth desligado. Ative o Bluetooth e tente novamente.');
      }

      console.log('[BT] buscando dispositivos pareados...');
      const paired = await RNBluetoothClassic.getBondedDevices();
      console.log('[BT] total pareados =', paired.length, paired.map(d => d.name));
      return paired;

    } catch (err: any) {
      const msg = err.message ?? 'Erro ao listar dispositivos';
      console.error('[BT] scanDevices ERRO:', msg);
      onError?.(msg);
      throw new Error(msg);
    }
  },

  // Chama no inicio do app para restaurar estado após hot reload
  async initialize(): Promise<void> {
    try {
      const connected = await RNBluetoothClassic.getConnectedDevices();
      if (connected && connected.length > 0 && !device) {
        console.log('[BT] initialize: conexão ativa encontrada ->', connected[0].name);
        device = connected[0];
        lineBuffer = '';
        subscribeEvents();
        onStatus?.(true);
      }
    } catch {
      // Sem conexões ativas ou API não disponível — ignorar
    }
  },

  async connect(address: string): Promise<void> {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    unsubscribeEvents();

    // Garante permissão antes de tentar conectar (Android 12+)
    const already = await hasBtPermissions();
    if (!already) {
      const granted = await requestBtPermissions();
      if (!granted) {
        const msg = 'Permissão Bluetooth negada. Habilite nas configurações do app.';
        onError?.(msg);
        onStatus?.(false);
        throw new Error(msg);
      }
    }

    try {
      const dev = await RNBluetoothClassic.connectToDevice(address);
      device            = dev;
      reconnectAttempts = 0;
      lineBuffer        = '';
      subscribeEvents();
      onStatus?.(true);
    } catch (err: any) {
      onError?.(err.message ?? 'Falha na conexão');
      onStatus?.(false);
      throw err;
    }
  },

  async disconnect(): Promise<void> {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    unsubscribeEvents();
    reconnectAttempts = MAX_RECONNECT;
    try {
      if (device) await device.disconnect();
    } catch {
      // ignora
    }
    device = null;
    onStatus?.(false);
  },

  isConnected(): boolean {
    return device !== null;
  },

  getLastData(): GovernadorData | null {
    return lastData;
  },

  async send(cmd: string): Promise<void> {
    if (!device) return;
    try {
      await device.write(cmd + '\n');
    } catch (err: any) {
      onError?.(err.message ?? 'Erro ao enviar comando');
    }
  },
};

export default bluetoothService;
