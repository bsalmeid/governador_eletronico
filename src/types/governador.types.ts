export interface GovernadorData {
  rpm: number;
  sp: number;       // setpoint RPM
  pwm: number;      // duty cycle 0-255
  mode: 'AUTO' | 'MANUAL';
  pot: number;      // leitura bruta do potenciômetro (0-4095)
  ppr: number;      // pulsos por revolução
  kp: number;       // ganho proporcional
  ki: number;       // ganho integral
  kd: number;       // ganho derivativo
  err: number;      // erro atual (rpm - setpoint)
  fault?: number;   // 1 = falha ativa (RPM abaixo do mínimo), 0 ou ausente = normal
  rpmMin?: number;  // valor atual de cfg.rpmMinSeguranca (para popular UI de config)
}

export interface DeviceInfo {
  id: string;       // endereço MAC
  name: string;     // nome BT
}

export interface SavedDevice {
  id: string;
  name: string;
}
