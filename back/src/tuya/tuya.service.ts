import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

import { TuyaReadCache } from './tuya-read-cache';

type TuyaRegion = 'eu' | 'us' | 'cn';

const REGION_HOSTS: Record<TuyaRegion, string> = {
  eu: 'openapi.tuyaeu.com',
  us: 'openapi.tuyaus.com',
  cn: 'openapi.tuyacn.com',
};

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface RoomDefinition {
  id: string;
  name: string;
  deviceIds: string[];
}

interface DeviceSnapshot {
  data: any;
  order: number;
  observedAt: number;
}

const ROOMS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STATE_CACHE_TTL_MS = 2 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 5_000;

@Injectable()
export class TuyaService {
  private readonly logger = new Logger(TuyaService.name);
  private readonly tokenCache = new Map<string, TokenCache>();
  private readonly reads = new TuyaReadCache();
  private readonly tokenRequests = new Map<string, Promise<string>>();
  private readonly incompleteRooms = new Set<string>();
  private readonly deviceReports = new Map<string, { device: any; order: number }>();
  private readOrder = 0;

  private accountKey(accessId: string, accessSecret: string, region: TuyaRegion) {
    return `${region}:${accessId}:${crypto.createHash('sha256').update(accessSecret).digest('hex')}`;
  }

  async validateCredentials(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
  ): Promise<boolean> {
    try {
      const token = await this.getToken(accessId, accessSecret, region);
      return !!token;
    } catch {
      this.logger.warn('Tuya credential validation failed');
      return false;
    }
  }

  async getDevices(accessId: string, accessSecret: string, region: TuyaRegion, refresh = false) {
    const account = this.accountKey(accessId, accessSecret, region);
    const snapshot = await this.reads.read<DeviceSnapshot>(
      `${account}:state:devices`,
      refresh ? REFRESH_COOLDOWN_MS : STATE_CACHE_TTL_MS,
      async () => {
        const order = ++this.readOrder;
        const observedAt = Date.now();
        const token = await this.getToken(accessId, accessSecret, region);
        const result = await this.request(
          accessId,
          accessSecret,
          region,
          token,
          'GET',
          '/v1.0/iot-01/associated-users/devices',
        );
        const devices: any[] = result?.devices ?? result;
        if (!Array.isArray(devices)) throw new Error('Invalid device list from Tuya');
        const all = [...devices];
        let page = result;
        const cursors = new Set<string>();
        while (page?.has_more === true) {
          const cursor = page.last_row_key;
          if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) {
            throw new Error('Invalid device pagination from Tuya');
          }
          cursors.add(cursor);
          page = await this.request(
            accessId,
            accessSecret,
            region,
            token,
            'GET',
            `/v1.0/iot-01/associated-users/devices?last_row_key=${encodeURIComponent(cursor)}`,
          );
          if (!Array.isArray(page?.devices)) throw new Error('Invalid device list from Tuya');
          all.push(...page.devices);
        }
        const unique = [...new Map(all.map((device) => [device.id, device])).values()];
        const data = Array.isArray(result)
          ? unique
          : { ...result, devices: unique, has_more: false };
        return { data, order, observedAt };
      },
    );
    const devices: any[] = snapshot.data?.devices ?? snapshot.data;
    const updated = devices.map((device) => this.rememberDevice(account, device, snapshot));
    return Array.isArray(snapshot.data) ? updated : { ...snapshot.data, devices: updated };
  }

  async getRooms(accessId: string, accessSecret: string, region: TuyaRegion, refresh = false) {
    const cacheKey = this.accountKey(accessId, accessSecret, region);
    // Room membership changes infrequently; device states share the short project cache.
    const devicesResult = await this.getDevices(accessId, accessSecret, region, refresh);
    const allDevices: any[] = devicesResult?.devices ?? devicesResult ?? [];
    const homeIds = [
      ...new Set<string>(
        allDevices
          .map((d: any) => d.owner_id)
          .filter((id) => id !== undefined && id !== null && id !== '')
          .map(String),
      ),
    ];

    const definitions = await this.reads.read(
      `${cacheKey}:rooms`,
      refresh ? 60_000 : this.incompleteRooms.has(cacheKey) ? 5 * 60_000 : ROOMS_CACHE_TTL_MS,
      async () => {
        const token = await this.getToken(accessId, accessSecret, region);
        const rooms: RoomDefinition[] = [];
        let complete = true;

        for (const homeId of homeIds) {
          try {
            const homeData: any = await this.request(
              accessId,
              accessSecret,
              region,
              token,
              'GET',
              `/v1.0/homes/${homeId}/rooms`,
            );
            const roomList: any[] = homeData?.rooms ?? [];
            for (const room of roomList) {
              const roomId = String(room.room_id ?? room.id);
              let roomDeviceIds: string[] = [];
              try {
                const roomDevices: any = await this.request(
                  accessId,
                  accessSecret,
                  region,
                  token,
                  'GET',
                  `/v1.0/homes/${homeId}/rooms/${roomId}/devices`,
                );
                const devArr: any[] = Array.isArray(roomDevices)
                  ? roomDevices
                  : (roomDevices?.devices ?? []);
                roomDeviceIds = devArr.map((d: any) => d.id ?? d.device_id).filter(Boolean);
              } catch {
                complete = false;
                /* device list unavailable for room — skip */
              }
              rooms.push({ id: roomId, name: room.name, deviceIds: roomDeviceIds });
            }
          } catch (e: any) {
            complete = false;
            this.logger.warn(`Could not fetch rooms for home ${homeId}: ${e.message}`);
          }
        }

        if (complete) this.incompleteRooms.delete(cacheKey);
        else this.incompleteRooms.add(cacheKey);
        return rooms;
      },
    );
    return this.populateRooms(definitions, allDevices);
  }

  private populateRooms(definitions: RoomDefinition[], devices: any[]) {
    const assignedDeviceIds = new Set(definitions.flatMap((room) => room.deviceIds));
    const rooms = definitions.map(({ id, name, deviceIds }) => ({
      id,
      name,
      devices: devices.filter((device) => deviceIds.includes(device.id)),
    }));
    const unassigned = devices.filter((device) => !assignedDeviceIds.has(device.id));
    if (unassigned.length > 0) {
      rooms.push({ id: 'unassigned', name: 'Unassigned', devices: unassigned });
    }
    return rooms;
  }

  async getDevice(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    deviceId: string,
    refresh = false,
  ) {
    if (!refresh) {
      const result = await this.getDevices(accessId, accessSecret, region);
      const listed = (result?.devices ?? result).find((device: any) => device.id === deviceId);
      if (listed) return listed;
    }
    const account = this.accountKey(accessId, accessSecret, region);
    const snapshot = await this.reads.read<DeviceSnapshot>(
      `${account}:state:device:${deviceId}`,
      refresh ? REFRESH_COOLDOWN_MS : STATE_CACHE_TTL_MS,
      async () => {
        const order = ++this.readOrder;
        const observedAt = Date.now();
        const token = await this.getToken(accessId, accessSecret, region);
        const device = await this.request(
          accessId,
          accessSecret,
          region,
          token,
          'GET',
          `/v1.0/devices/${deviceId}`,
        );
        return { data: device, order, observedAt };
      },
    );
    return this.rememberDevice(account, snapshot.data, snapshot);
  }

  private rememberDevice(account: string, device: any, snapshot: DeviceSnapshot) {
    if (!device?.id) throw new Error('Invalid device response from Tuya');
    const previous = this.deviceReports.get(`${account}:${device.id}`);
    if (previous && previous.order >= snapshot.order) return structuredClone(previous.device);
    const reported = { ...device, statusUpdatedAt: snapshot.observedAt };
    this.deviceReports.set(`${account}:${device.id}`, {
      device: structuredClone(reported),
      order: snapshot.order,
    });
    this.reads.update<DeviceSnapshot>(`${account}:state:device:${device.id}`, (cached) => ({
      ...snapshot,
      data: { ...cached.data, ...reported },
    }));
    this.reads.update<DeviceSnapshot>(`${account}:state:devices`, (cached) => {
      const result = cached.data;
      const devices = Array.isArray(result) ? result : result.devices;
      const updated = devices.map((entry: any) =>
        entry.id === device.id ? { ...entry, ...reported } : entry,
      );
      return { ...cached, data: Array.isArray(result) ? updated : { ...result, devices: updated } };
    });
    return reported;
  }

  /** Alarm and automation checks share one recent project-wide read, rather than one per sensor. */
  async getDeviceStatuses(accessId: string, accessSecret: string, region: TuyaRegion) {
    const result = await this.getDevices(accessId, accessSecret, region, true);
    return (result?.devices ?? result) as any[];
  }

  async getDeviceSpecifications(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    deviceId: string,
  ) {
    const account = this.accountKey(accessId, accessSecret, region);
    return this.reads.read(
      `${account}:specifications:${deviceId}`,
      24 * 60 * 60 * 1000,
      async () => {
        const token = await this.getToken(accessId, accessSecret, region);
        return this.request(
          accessId,
          accessSecret,
          region,
          token,
          'GET',
          `/v1.0/devices/${deviceId}/specifications`,
        );
      },
    );
  }

  async getDeviceStatus(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    deviceId: string,
  ) {
    const account = this.accountKey(accessId, accessSecret, region);
    return this.reads.read(`${account}:state:status:${deviceId}`, REFRESH_COOLDOWN_MS, async () => {
      const token = await this.getToken(accessId, accessSecret, region);
      return this.request(
        accessId,
        accessSecret,
        region,
        token,
        'GET',
        `/v1.0/devices/${deviceId}/status`,
      );
    });
  }

  async sendCommand(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    deviceId: string,
    commands: { code: string; value: unknown }[],
  ) {
    const token = await this.getToken(accessId, accessSecret, region);
    try {
      return await this.request(
        accessId,
        accessSecret,
        region,
        token,
        'POST',
        `/v1.0/devices/${deviceId}/commands`,
        { commands },
      );
    } finally {
      // A timeout can still mean delivery. Never keep a pre-command state after a write attempt.
      const account = this.accountKey(accessId, accessSecret, region);
      this.reads.invalidate(`${account}:state:`);
      this.deviceReports.delete(`${account}:${deviceId}`);
    }
  }

  private async getToken(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
  ): Promise<string> {
    const cacheKey = this.accountKey(accessId, accessSecret, region);
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const pending = this.tokenRequests.get(cacheKey);
    if (pending) return pending;
    const request = this.requestToken(accessId, accessSecret, region, cacheKey);
    this.tokenRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (this.tokenRequests.get(cacheKey) === request) this.tokenRequests.delete(cacheKey);
    }
  }

  private async requestToken(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    cacheKey: string,
  ): Promise<string> {
    const t = Date.now().toString();
    const path = '/v1.0/token?grant_type=1';
    const sign = this.sign(accessId, accessSecret, t, '', 'GET', path, '');
    const host = REGION_HOSTS[region];

    const res = await fetch(`https://${host}${path}`, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        client_id: accessId,
        sign,
        t,
        sign_method: 'HMAC-SHA256',
      },
    });
    const data = (await res.json()) as any;
    this.logger.debug(
      `Tuya token request completed (HTTP ${res.status}, success=${data.success === true})`,
    );
    if (!data.success) throw new Error(data.msg ?? 'Tuya request failed');

    const token = data.result.access_token as string;
    const ttlMs = (data.result.expire_time ?? 7200) * 1000;
    this.tokenCache.set(cacheKey, { token, expiresAt: Date.now() + ttlMs - 5 * 60 * 1000 });
    return token;
  }

  private async request(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ) {
    const t = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const sign = this.sign(accessId, accessSecret, t, token, method, path, bodyStr);
    const host = REGION_HOSTS[region];

    const res = await fetch(`https://${host}${path}`, {
      signal: AbortSignal.timeout(15_000),
      method,
      headers: {
        client_id: accessId,
        access_token: token,
        sign,
        t,
        sign_method: 'HMAC-SHA256',
        'Content-Type': 'application/json',
      },
      ...(bodyStr ? { body: bodyStr } : {}),
    });
    const data = (await res.json()) as any;
    this.logger.debug(
      `Tuya ${method} ${path} (HTTP ${res.status}, success=${data.success === true})`,
    );
    if (!data.success) throw new Error(data.msg ?? 'Tuya request failed');
    return data.result;
  }

  private sign(
    accessId: string,
    accessSecret: string,
    t: string,
    token: string,
    method: string,
    path: string,
    body: string,
  ): string {
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
    const stringToSign = `${method}\n${bodyHash}\n\n${path}`;
    const str = `${accessId}${token}${t}${stringToSign}`;
    return crypto.createHmac('sha256', accessSecret).update(str).digest('hex').toUpperCase();
  }
}
