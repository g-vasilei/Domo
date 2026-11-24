import { createDecipheriv, createHash, timingSafeEqual } from 'crypto';

export interface TuyaReport {
  deviceId: string;
  status: { code: string; value: unknown; reportedAt?: number }[];
  observedAt: number;
  online?: boolean;
}

export function messagePassword(accessId: string, secret: string) {
  const digest = createHash('md5').update(secret).digest('hex');
  return createHash('md5')
    .update(accessId + digest)
    .digest('hex')
    .slice(8, 24);
}

/** Tuya's signed Pulsar envelope; TLS verification remains enabled in the transport. */
export function decodeTuyaMessage(
  raw: string,
  secret: string,
): { messageId: string; report: TuyaReport | null } {
  const frame = JSON.parse(raw);
  if (typeof frame.messageId !== 'string' || typeof frame.payload !== 'string')
    throw Error('Invalid message frame');
  const envelope = JSON.parse(Buffer.from(frame.payload, 'base64').toString('utf8'));
  if (typeof envelope.sign !== 'string' || !/^[a-f0-9]{32}$/i.test(envelope.sign))
    throw Error('Invalid message signature');
  const signed =
    Object.keys(envelope)
      .filter((key) => key !== 'sign' && envelope[key] !== '' && envelope[key] != null)
      .sort()
      .map((key) => `${key}=${envelope[key]}`)
      .join('||') + `||${secret}`;
  const expected = createHash('md5').update(signed).digest();
  if (!timingSafeEqual(expected, Buffer.from(envelope.sign, 'hex')))
    throw Error('Invalid message signature');
  const key = Buffer.from(secret.slice(8, 24), 'utf8');
  if (key.length !== 16 || typeof envelope.data !== 'string')
    throw Error('Invalid message encryption');
  const encrypted = Buffer.from(envelope.data, 'base64');
  const mode = frame.properties?.em ?? 'aes_ecb';
  let clear: Buffer;
  if (mode === 'aes_gcm') {
    if (encrypted.length < 28) throw Error('Invalid encrypted message');
    const decipher = createDecipheriv('aes-128-gcm', key, encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(-16));
    clear = Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]);
  } else if (mode === 'aes_ecb') {
    const decipher = createDecipheriv('aes-128-ecb', key, null);
    clear = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } else throw Error('Unsupported message encryption');
  const data = JSON.parse(clear.toString('utf8'));
  const business = data.bizData ?? data;
  const deviceId = data.devId ?? business.devId;
  const observedAt = Number(data.ts ?? envelope.t);
  if (typeof deviceId !== 'string' || !Number.isFinite(observedAt) || observedAt <= 0) {
    return { messageId: frame.messageId, report: null };
  }
  const entries =
    envelope.protocol === 4
      ? data.status
      : envelope.protocol === 1000 &&
          ['devicePropertyMessage', 'deviceQueryPropertyMessage'].includes(data.bizCode)
        ? business.properties
        : [];
  const status = (Array.isArray(entries) ? entries : [])
    .filter((entry: any) => typeof entry.code === 'string' && entry.value !== undefined)
    .map((entry: any) => {
      let value = entry.value;
      // IoT Core serializes scalar property values, unlike the legacy protocol.
      if (envelope.protocol === 1000 && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          /* enum/string value */
        }
      }
      const reportedAt = Number(entry.t ?? entry.time);
      return {
        code: entry.code,
        value,
        ...(Number.isFinite(reportedAt) && reportedAt > 0 ? { reportedAt } : {}),
      };
    });
  const online = ['online', 'deviceOnline'].includes(data.bizCode)
    ? true
    : ['offline', 'deviceOffline'].includes(data.bizCode)
      ? false
      : undefined;
  return {
    messageId: frame.messageId,
    report:
      status.length || online !== undefined
        ? { deviceId, status, observedAt, ...(online !== undefined ? { online } : {}) }
        : null,
  };
}
