import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

import { TuyaReport } from './tuya-message-codec';
import { TuyaCredentials, TuyaMessagesService } from './tuya-messages.service';
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
const MESSAGE_STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 5_000;
const REPORT_PROTECTION_MS = 60_000;

export interface DeviceStateReport {
  deviceId: string;
  status: { code: string; value: unknown }[];
  statusUpdatedAt: number;
  reportVersion: number;
  online?: boolean;
  observedAt?: number;
  source?: 'message' | 'readback' | 'confirmed';
}

export interface CommandResult {
  success: true;
  confirmed: boolean;
  report: DeviceStateReport | null;
}

interface RecentReport {
  fields: Map<
    string,
    { value: unknown; at: number; receivedAt: number; order: number; messageAt?: number }
  >;
  online?: { value: boolean; at: number; receivedAt: number };
}

@Injectable()
export class TuyaService implements OnModuleDestroy {
  private readonly logger = new Logger(TuyaService.name);
  private readonly tokenCache = new Map<string, TokenCache>();
  private readonly reads = new TuyaReadCache();
  private readonly tokenRequests = new Map<string, Promise<string>>();
  private readonly incompleteRooms = new Set<string>();
  private readonly deviceReports = new Map<string, { device: any; order: number }>();
  private readonly recentReports = new Map<string, RecentReport>();
  private readonly realReports = new Map<string, { report: DeviceStateReport; order: number }>();
  private readonly commandVersions = new Map<string, number>();
  private readonly pendingCommands = new Map<string, number>();
  private readonly events = new EventEmitter();
  private revision = Date.now();
  private readOrder = 0;
  private readonly startedAt = Date.now();
  private readonly usage = new Map<string, Map<string, number>>();

  constructor(@Optional() private readonly messages?: TuyaMessagesService) {
    this.messages?.on('report', this.receiveMessage);
    this.messages?.on('connected', this.resetSnapshot);
    this.messages?.on('disconnected', this.resetSnapshot);
    this.events.setMaxListeners(0);
  }

  private readonly resetSnapshot = (creds: TuyaCredentials) => {
    // Reconcile gaps after reconnect. Do not fan out one API read per browser.
    this.reads.invalidate(
      `${this.accountKey(creds.accessId, creds.accessSecret, creds.region as TuyaRegion)}:state:devices`,
    );
    const prefix = `${this.accountKey(creds.accessId, creds.accessSecret, creds.region as TuyaRegion)}:`;
    for (const [key, report] of this.recentReports)
      if (key.startsWith(prefix)) {
        for (const field of report.fields.values()) field.receivedAt = 0;
        if (report.online) report.online.receivedAt = 0;
      }
  };

  private readonly receiveMessage = (creds: TuyaCredentials, report: TuyaReport) => {
    // Retained messages must not replay old alarm/automation transitions on startup.
    if (
      report.observedAt < Date.now() - REPORT_PROTECTION_MS ||
      report.observedAt > Date.now() + 30_000
    )
      return;
    this.recordReport(creds, report, true);
  };

  onReport(listener: (creds: TuyaCredentials, report: DeviceStateReport) => void) {
    this.events.on('report', listener);
    return () => {
      this.events.off('report', listener);
    };
  }

  onModuleDestroy() {
    this.messages?.off('report', this.receiveMessage);
    this.messages?.off('connected', this.resetSnapshot);
    this.messages?.off('disconnected', this.resetSnapshot);
    this.events.removeAllListeners();
  }

  private ensureMessages(accessId: string, accessSecret: string, region: TuyaRegion) {
    const creds = { accessId, accessSecret, region };
    this.messages?.ensure(creds);
    return this.messages?.connected(creds) === true;
  }

  private replacePolling(connected: boolean) {
    // A WebSocket handshake alone does not prove that production messaging rules
    // include every alarm sensor. Opt in only after verifying the project's rules.
    return connected && process.env.TUYA_MESSAGES_REPLACE_POLLING === 'true';
  }

  getDiagnostics(accessId: string, accessSecret: string, region: TuyaRegion) {
    const connected = this.ensureMessages(accessId, accessSecret, region);
    const replacePolling = this.replacePolling(connected);
    const counts = this.usage.get(this.accountKey(accessId, accessSecret, region));
    return {
      since: this.startedAt,
      apiCalls: [...(counts?.values() ?? [])].reduce((sum, count) => sum + count, 0),
      byEndpoint: Object.fromEntries(counts ?? []),
      messages: {
        enabled: process.env.TUYA_MESSAGES_ENABLED !== 'false',
        connected,
        pollingReplaced: replacePolling,
        ...this.messages?.diagnostics({ accessId, accessSecret, region }),
      },
      stateCacheSeconds: (replacePolling ? MESSAGE_STATE_TTL_MS : STATE_CACHE_TTL_MS) / 1000,
      monitoring: replacePolling ? 'messages' : 'polling',
    };
  }

  private countRequest(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    method: string,
    path: string,
  ) {
    const account = this.accountKey(accessId, accessSecret, region);
    let counts = this.usage.get(account);
    if (!counts) this.usage.set(account, (counts = new Map()));
    const endpoint = `${method} ${path
      .split('?')[0]
      .replace(/\/devices\/[^/]+/g, '/devices/:id')
      .replace(/\/homes\/[^/]+/g, '/homes/:id')
      .replace(/\/rooms\/[^/]+/g, '/rooms/:id')}`;
    counts.set(endpoint, (counts.get(endpoint) ?? 0) + 1);
  }

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
    const connected = this.replacePolling(this.ensureMessages(accessId, accessSecret, region));
    const account = this.accountKey(accessId, accessSecret, region);
    const snapshot = await this.reads.read<DeviceSnapshot>(
      `${account}:state:devices`,
      refresh ? REFRESH_COOLDOWN_MS : connected ? MESSAGE_STATE_TTL_MS : STATE_CACHE_TTL_MS,
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
    if (previous && previous.order >= snapshot.order) {
      // A push can precede the first metadata/list response.
      previous.device = { ...device, ...previous.device };
      return structuredClone(previous.device);
    }
    const recent = this.recentReports.get(`${account}:${device.id}`);
    const status = new Map<string, any>(
      (device.status ?? []).map((entry: any) => [entry.code, entry]),
    );
    for (const [code, field] of recent?.fields ?? []) {
      if (Date.now() - field.receivedAt < REPORT_PROTECTION_MS)
        status.set(code, { code, value: field.value });
    }
    const online =
      recent?.online && Date.now() - recent.online.receivedAt < REPORT_PROTECTION_MS
        ? recent.online.value
        : device.online;
    const reported = {
      ...device,
      status: [...status.values()],
      online,
      statusUpdatedAt: snapshot.observedAt,
      reportVersion: this.nextRevision(),
    };
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
  async getDeviceStatuses(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    cached = false,
  ) {
    const connected = this.replacePolling(this.ensureMessages(accessId, accessSecret, region));
    // With a live message stream the 30s security check is local. If it drops,
    // keep the existing fresh-cloud fallback instead of reducing alarm coverage.
    const result = await this.getDevices(accessId, accessSecret, region, !connected && !cached);
    const account = this.accountKey(accessId, accessSecret, region);
    return ((result?.devices ?? result) as any[]).map((device) =>
      this.pendingCommands.has(`${account}:${device.id}`) ? { ...device, status: [] } : device,
    );
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
    return (
      await this.readStatus({ accessId, accessSecret, region }, deviceId, REFRESH_COOLDOWN_MS)
    ).status;
  }

  private async readStatus(
    creds: TuyaCredentials,
    deviceId: string,
    maxAgeMs: number,
    timeoutMs = 15_000,
  ) {
    const { accessId, accessSecret } = creds;
    const region = creds.region as TuyaRegion;
    const account = this.accountKey(accessId, accessSecret, region);
    const snapshot = await this.reads.read<DeviceSnapshot>(
      `${account}:state:status:${deviceId}`,
      maxAgeMs,
      async () => {
        const order = ++this.readOrder;
        const observedAt = Date.now();
        const token = await this.getToken(accessId, accessSecret, region);
        const status = await this.request(
          accessId,
          accessSecret,
          region,
          token,
          'GET',
          `/v1.0/devices/${deviceId}/status`,
          undefined,
          timeoutMs,
        );
        if (!Array.isArray(status)) throw new Error('Invalid device status from Tuya');
        return { data: status, order, observedAt };
      },
    );
    const previous = this.deviceReports.get(`${account}:${deviceId}`);
    if (previous && previous.order >= snapshot.order) return this.toReport(previous.device);
    const reported = this.recordReport(
      creds,
      { deviceId, status: snapshot.data, observedAt: snapshot.observedAt },
      false,
      snapshot.order,
    );
    if (reported) return reported;
    return this.toReport(this.deviceReports.get(`${account}:${deviceId}`)!.device);
  }

  async sendCommand(
    accessId: string,
    accessSecret: string,
    region: TuyaRegion,
    deviceId: string,
    commands: { code: string; value: unknown }[],
  ): Promise<CommandResult> {
    this.ensureMessages(accessId, accessSecret, region);
    const creds = { accessId, accessSecret, region };
    const account = this.accountKey(accessId, accessSecret, region);
    const key = `${account}:${deviceId}`;
    const version = (this.commandVersions.get(key) ?? 0) + 1;
    this.commandVersions.set(key, version);
    this.pendingCommands.set(key, version);
    const clearPending = () => {
      if (this.pendingCommands.get(key) === version) this.pendingCommands.delete(key);
    };
    const issuedOrder = ++this.readOrder;
    const issuedAt = Date.now();
    // Only the affected device needs confirmation. Keep the last reported house
    // snapshot; invalidating it here used to cache the cloud's lagging old state.
    this.reads.invalidate(`${account}:state:device:${deviceId}`);
    this.reads.invalidate(`${account}:state:status:${deviceId}`);
    let attempted = false;
    try {
      const token = await this.getToken(accessId, accessSecret, region);
      attempted = true;
      const accepted = await this.request(
        accessId,
        accessSecret,
        region,
        token,
        'POST',
        `/v1.0/devices/${deviceId}/commands`,
        { commands },
      );
      if (accepted === false)
        throw Object.assign(new Error('Device rejected command'), { tuyaRejected: true });
    } catch (error) {
      // A timeout may still mean delivery. Reconcile without resending a write.
      if (attempted && !(error as any)?.tuyaRejected)
        void this.confirmCommand(creds, deviceId, commands, issuedOrder, issuedAt, version)
          .catch(() => {})
          .finally(clearPending);
      else clearPending();
      throw error;
    }
    try {
      return await this.confirmCommand(creds, deviceId, commands, issuedOrder, issuedAt, version);
    } finally {
      clearPending();
    }
  }

  private nextRevision() {
    return (this.revision = Math.max(Date.now(), this.revision + 1));
  }

  private toReport(device: any): DeviceStateReport {
    return structuredClone({
      deviceId: device.id,
      status: device.status ?? [],
      statusUpdatedAt: device.statusUpdatedAt,
      reportVersion: device.reportVersion,
      ...(device.online !== undefined ? { online: device.online } : {}),
    });
  }

  private recordReport(
    creds: TuyaCredentials,
    report: TuyaReport,
    fromMessage: boolean,
    order = ++this.readOrder,
  ) {
    const account = this.accountKey(creds.accessId, creds.accessSecret, creds.region as TuyaRegion);
    const key = `${account}:${report.deviceId}`;
    const previous = this.deviceReports.get(key);
    // A read begun before a newer report cannot roll it back.
    if (previous && previous.order > order && !fromMessage)
      return this.realReports.get(key)?.report ?? null;
    let recent = this.recentReports.get(key);
    if (!recent) this.recentReports.set(key, (recent = { fields: new Map() }));
    const status = new Map<string, any>(
      (previous?.device.status ?? []).map((entry: any) => [entry.code, entry]),
    );
    let changed = false;
    for (const entry of report.status) {
      const latest = recent.fields.get(entry.code);
      const observedAt = entry.reportedAt ?? report.observedAt;
      if (fromMessage && latest?.messageAt !== undefined && observedAt <= latest.messageAt)
        continue;
      if (
        fromMessage &&
        (observedAt < Date.now() - REPORT_PROTECTION_MS ||
          observedAt > Date.now() + 30_000 ||
          (latest && observedAt < latest.at - 2000))
      )
        continue;
      status.set(entry.code, { code: entry.code, value: structuredClone(entry.value) });
      if (fromMessage)
        recent.fields.set(entry.code, {
          value: structuredClone(entry.value),
          at: observedAt,
          receivedAt: Date.now(),
          messageAt: observedAt,
          order,
        });
      changed = true;
    }
    let online = previous?.device.online;
    if (report.online !== undefined && (!recent.online || report.observedAt > recent.online.at)) {
      online = report.online;
      recent.online = { value: online, at: report.observedAt, receivedAt: Date.now() };
      changed = true;
    }
    if (!changed && previous) return this.realReports.get(key)?.report ?? null;
    const device = {
      ...previous?.device,
      id: report.deviceId,
      status: [...status.values()],
      ...(online !== undefined ? { online } : {}),
      statusUpdatedAt: Math.max(previous?.device.statusUpdatedAt ?? 0, report.observedAt),
      reportVersion: this.nextRevision(),
    };
    this.deviceReports.set(key, { device: structuredClone(device), order });
    // Protect a confirmed readback from an eventually-consistent list response.
    if (!fromMessage)
      for (const entry of report.status) {
        const latest = recent.fields.get(entry.code);
        recent.fields.set(entry.code, {
          value: structuredClone(status.get(entry.code).value),
          at: Math.max(report.observedAt, latest?.at ?? 0),
          receivedAt: Date.now(),
          messageAt: latest?.messageAt,
          order,
        });
      }
    this.reads.update<DeviceSnapshot>(`${account}:state:device:${report.deviceId}`, (cached) => ({
      ...cached,
      order,
      data: { ...cached.data, ...device },
    }));
    this.reads.update<DeviceSnapshot>(`${account}:state:devices`, (cached) => {
      const list = cached.data?.devices ?? cached.data;
      const devices = list.map((entry: any) =>
        entry.id === device.id ? { ...entry, ...device } : entry,
      );
      return {
        ...cached,
        data: Array.isArray(cached.data) ? devices : { ...cached.data, devices },
      };
    });
    const result: DeviceStateReport = {
      ...this.toReport(device),
      observedAt: report.observedAt,
      source: fromMessage ? 'message' : 'readback',
    };
    this.realReports.set(key, { report: structuredClone(result), order });
    this.events.emit('confirmation', key);
    this.events.emit('report', creds, structuredClone(result));
    return result;
  }

  private async confirmCommand(
    creds: TuyaCredentials,
    deviceId: string,
    commands: { code: string; value: unknown }[],
    issuedOrder: number,
    issuedAt: number,
    version: number,
  ): Promise<CommandResult> {
    const key = `${this.accountKey(creds.accessId, creds.accessSecret, creds.region as TuyaRegion)}:${deviceId}`;
    const matchingReport = () => {
      const latest = this.realReports.get(key);
      return latest &&
        latest.order > issuedOrder &&
        latest.report.online !== false &&
        commands.every((command) => {
          const field = this.recentReports.get(key)?.fields.get(command.code);
          return (
            field &&
            field.order > issuedOrder &&
            field.at >= issuedAt - 1000 &&
            JSON.stringify(field.value) === JSON.stringify(command.value)
          );
        })
        ? latest.report
        : null;
    };
    const confirmed = (report: DeviceStateReport): CommandResult => {
      if (report.source === 'readback') {
        report = { ...report, source: 'confirmed' };
        this.realReports.get(key)!.report = structuredClone(report);
        // Lagging, unmatched readbacks update the display but must not rearm or
        // fire automations. Evaluate only a matching report or a real push.
        this.events.emit('report', creds, structuredClone(report));
      }
      return { success: true, confirmed: true, report: structuredClone(report) };
    };
    for (const delay of [250, 750, 1500]) {
      if (this.commandVersions.get(key) !== version) break;
      let report = matchingReport();
      if (report) return confirmed(report);
      await this.waitForReport(key, delay, matchingReport);
      if (this.commandVersions.get(key) !== version) break;
      report = matchingReport();
      if (report) return confirmed(report);
      if (this.commandVersions.get(key) !== version) break;
      try {
        await this.readStatus(creds, deviceId, 0, 1500);
      } catch {
        /* bounded retry; never resend a command */
      }
      report = matchingReport();
      if (report) return confirmed(report);
    }
    return {
      success: true,
      confirmed: false,
      report: structuredClone(this.realReports.get(key)?.report ?? null),
    };
  }

  private waitForReport(key: string, ms: number, matches: () => unknown) {
    return new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.events.off('confirmation', listener);
        resolve();
      };
      const listener = (changedKey: string) => {
        if (changedKey === key && matches()) finish();
      };
      const timer = setTimeout(finish, ms);
      this.events.on('confirmation', listener);
    });
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

    this.countRequest(accessId, accessSecret, region, 'GET', path);
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
    if (!data.success)
      throw Object.assign(new Error(data.msg ?? 'Tuya request failed'), { tuyaRejected: true });

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
    timeoutMs = 15_000,
  ) {
    const t = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const sign = this.sign(accessId, accessSecret, t, token, method, path, bodyStr);
    const host = REGION_HOSTS[region];

    this.countRequest(accessId, accessSecret, region, method, path);
    const res = await fetch(`https://${host}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
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
    if (!data.success)
      throw Object.assign(new Error(data.msg ?? 'Tuya request failed'), { tuyaRejected: true });
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
