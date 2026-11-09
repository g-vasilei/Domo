import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly algo = 'aes-256-gcm';

  constructor(config: ConfigService) {
    const configuredKey = config.get<string>('ENCRYPTION_KEY');
    if (!configuredKey) throw new Error('ENCRYPTION_KEY env var is not set');
    // Keep the existing GCM hex format; also support the UTF-8 key format
    // already used by UsersService for Tuya credentials without changing the secret.
    this.key = /^[0-9a-f]{64}$/i.test(configuredKey)
      ? Buffer.from(configuredKey, 'hex')
      : Buffer.from(configuredKey, 'utf8').subarray(0, 32);
    if (this.key.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY must contain at least 32 UTF-8 bytes or exactly 64 hexadecimal characters',
      );
    }
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algo, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(data: string): string {
    const buf = Buffer.from(data, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv(this.algo, this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  }
}
