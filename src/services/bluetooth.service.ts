import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
import { Platform, PermissionsAndroid } from 'react-native';
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

// Solicita uma permissão por vez com timeout de 8s (evita trava no Android 16)
async function requestPermWithTimeout(perm: string): Promise<string> {
  return Promise.race([
    PermissionsAndroid.request(perm as any),
    new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 8000)),
  ]);
}

async function hasBtPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return true;
  const [connect, scan] = await Promise.all([
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
  ]);
  console.log('[BT] check CONNECT=' + connect + ' SCAN=' + scan);
  return connect && scan;
}

async function requestBtPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return true;

  // Solicita uma de cada vez com timeout para não travar no Android 16
  const connectResult = await requestPermWithTimeout(
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
  );
  console.log('[BT] BLUETOOTH_CONNECT result =', connectResult);

  const scanResult = await requestPermWithTimeout(
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
  );
  console.log('[BT] BLUETOOTH_SCAN result =', scanResult);

  const ok = connectResult === PermissionsAndroid.RESULTS.GRANTED &&
             scanResult    === PermissionsAndroid.RESULTS.GRANTED;

  if (!ok) {
    console.warn('[BT] Permissões não concedidas — verifique se o APK foi reconstruído com expo run:android');
  }
  return ok;
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
