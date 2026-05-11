import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

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

interface RoomsCache {
  rooms: any[];
  expiresAt: number;
}

const ROOMS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

@Injectable()
export class TuyaService {
  private readonly logger = new Logger(TuyaService.name);
  private readonly tokenCache = new Map<string, TokenCache>();
  private readonly roomsCache = new Map<string, RoomsCache>();

  async validateCredentials(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
  ): Promise<boolean> {
    try {
      const token = await this.getToken(accessId, accessSecret, region);
      return !!token;
    } catch (e: any) {
      this.logger.error(`Tuya validation failed: ${e?.message}`);
      return false;
    }
  }

  async getDevices(accessId: string, accessSecret: string, region: TuyaRegion) {
    const token = await this.getToken(accessId, accessSecret, region);
    return this.request(
      accessId,
      accessSecret,
      region,
      token,
      'GET',
      '/v1.0/iot-01/associated-users/devices',
    );
  }

  async getRooms(accessId: string, accessSecret: string, region: TuyaRegion) {
    const cacheKey = `${accessId}:${region}`;
    const cached = this.roomsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.rooms;
    }

    const token = await this.getToken(accessId, accessSecret, region);

    const devicesResult = await this.request(
      accessId,
      accessSecret,
      region,
      token,
      'GET',
      '/v1.0/iot-01/associated-users/devices',
    );
    const allDevices: any[] = devicesResult?.devices ?? [];

    const homeIds = [
      ...new Set<string>(allDevices.map((d: any) => String(d.owner_id)).filter(Boolean)),
    ];

    const rooms: { id: string; name: string; devices: any[] }[] = [];
    const assignedDeviceIds = new Set<string>();

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
          } catch (_e) {
            /* device list unavailable for room — skip */
          }
          const devices = allDevices.filter((d) => roomDeviceIds.includes(d.id));
          devices.forEach((d) => assignedDeviceIds.add(d.id));
          rooms.push({ id: roomId, name: room.name, devices });
        }
      } catch (e: any) {
        this.logger.warn(`Could not fetch rooms for home ${homeId}: ${e.message}`);
      }
    }

    const unassigned = allDevices.filter((d) => !assignedDeviceIds.has(d.id));
    if (unassigned.length > 0) {
      rooms.push({ id: 'unassigned', name: 'Unassigned', devices: unassigned });
    }

    this.roomsCache.set(cacheKey, { rooms, expiresAt: Date.now() + ROOMS_CACHE_TTL_MS });
    return rooms;
  }

  async getDevice(accessId: string, accessSecret: string, region: TuyaRegion, deviceId: string) {
    const token = await this.getToken(accessId, accessSecret, region);
    return this.request(accessId, accessSecret, region, token, 'GET', `/v1.0/devices/${deviceId}`);
  }

  async getDeviceStatus(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    deviceId: string,
  ) {
    const token = await this.getToken(accessId, accessSecret, region);
    return this.request(
      accessId,
      accessSecret,
      region,
      token,
      'GET',
      `/v1.0/devices/${deviceId}/status`,
    );
  }

  async diagnoseRooms(accessId: string, accessSecret: string, region: TuyaRegion) {
    const token = await this.getToken(accessId, accessSecret, region);
    const result: Record<string, any> = {};

    // 1. Raw device list — show all fields of first device
    const devicesResult = await this.request(
      accessId,
      accessSecret,
      region,
      token,
      'GET',
      '/v1.0/iot-01/associated-users/devices',
    );
    const devices: any[] = devicesResult?.devices ?? [];
    result.deviceCount = devices.length;
    result.firstDeviceFields = devices[0]
      ? Object.entries(devices[0]).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
      : null;

    const ownerIds = [...new Set(devices.map((d: any) => d.owner_id).filter(Boolean))];
    const uids = [...new Set(devices.map((d: any) => d.uid).filter(Boolean))];
    result.ownerIds = ownerIds;
    result.uids = uids;

    // 2. Try home endpoints with each candidate ID
    const candidates = [...new Set([...ownerIds, ...uids])];
    result.homeAttempts = {};
    for (const id of candidates.slice(0, 3)) {
      const attempts: Record<string, any> = {};
      for (const path of [
        `/v1.0/homes/${id}/rooms`,
        `/v1.0/home/${id}/rooms`,
        `/v1.0/users/${id}/homes`,
        `/v2.0/homes/${id}/rooms`,
      ]) {
        try {
          attempts[path] = await this.request(accessId, accessSecret, region, token, 'GET', path);
        } catch (e: any) {
          attempts[path] = { error: e.message };
        }
      }
      result.homeAttempts[id] = attempts;
    }

    return result;
  }

  async sendCommand(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    deviceId: string,
    commands: { code: string; value: unknown }[],
  ) {
    const token = await this.getToken(accessId, accessSecret, region);
    return this.request(
      accessId,
      accessSecret,
      region,
      token,
      'POST',
      `/v1.0/devices/${deviceId}/commands`,
      { commands },
    );
  }

  private async getToken(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
  ): Promise<string> {
    const cacheKey = `${accessId}:${region}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const t = Date.now().toString();
    const path = '/v1.0/token?grant_type=1';
    const sign = this.sign(accessId, accessSecret, t, '', 'GET', path, '');
    const host = REGION_HOSTS[region];

    const res = await fetch(`https://${host}${path}`, {
      headers: {
        client_id: accessId,
        sign,
        t,
        sign_method: 'HMAC-SHA256',
      },
    });
    const data = (await res.json()) as any;
    this.logger.debug(`Tuya token response: ${JSON.stringify(data)}`);
    if (!data.success) throw new Error(data.msg ?? JSON.stringify(data));

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
    this.logger.debug(`Tuya ${method} ${path} → ${JSON.stringify(data)}`);
    if (!data.success) throw new Error(data.msg ?? JSON.stringify(data));
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
