export interface TemperatureDevice {
  id: string;
  name: string;
  online?: boolean;
  status?: { code: string; value: unknown }[];
}
export interface TemperatureRoom {
  id: string;
  name: string;
  devices?: { id: string }[];
}
export interface TemperatureSensor {
  device: TemperatureDevice;
  room: string;
  celsius: number | null;
  humidity: number | null;
}

const TEMPERATURE_CODES = [
  'va_temperature',
  'temp_current',
  'temperature_current',
  'temp_current_f',
];
const HUMIDITY_CODES = ['va_humidity', 'humidity_value', 'humidity'];

export function temperatureSensors(
  devices: TemperatureDevice[],
  rooms: TemperatureRoom[],
): TemperatureSensor[] {
  return devices
    .flatMap((device) => {
      const status = device.status ?? [];
      const reading = TEMPERATURE_CODES.map((code) =>
        status.find((entry) => entry.code === code),
      ).find(Boolean);
      if (!reading) return [];
      const raw = reading.value;
      let celsius = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      if (celsius !== null) {
        if (reading.code === 'va_temperature') celsius /= 10;
        else if (reading.code === 'temp_current_f') celsius = ((celsius - 32) * 5) / 9;
      }
      const humidityReading = HUMIDITY_CODES.map((code) =>
        status.find((entry) => entry.code === code),
      ).find(Boolean);
      const rawHumidity = humidityReading?.value;
      let humidity =
        typeof rawHumidity === 'number' && Number.isFinite(rawHumidity) ? rawHumidity : null;
      if (humidity !== null && humidityReading?.code === 'va_humidity') humidity /= 10;
      if (humidity !== null && (humidity < 0 || humidity > 100)) humidity = null;
      const room = rooms.find(
        (entry) => entry.id !== 'unassigned' && entry.devices?.some((d) => d.id === device.id),
      );
      return [{ device, room: room?.name ?? 'Χωρίς δωμάτιο', celsius, humidity }];
    })
    .sort(
      (a, b) =>
        a.room.localeCompare(b.room, 'el') || a.device.name.localeCompare(b.device.name, 'el'),
    );
}

export function selectedTemperatureSensors(sensors: TemperatureSensor[], ids: string[]) {
  return [...new Set(ids)]
    .map((id) => sensors.find((s) => s.device.id === id))
    .filter((s): s is TemperatureSensor => !!s)
    .slice(0, 2);
}
