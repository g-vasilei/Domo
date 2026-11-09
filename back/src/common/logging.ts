import type { Options } from 'pino-http';

// Successful polling requests stay available at debug level without flooding normal logs.
// Allowlist HTTP fields so credentials, cookies, bodies and query strings never get logged.
export const httpLoggingOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  autoLogging: true,
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'debug';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'access_token',
      'refresh_token',
      'local_key',
      'password',
      'passwordHash',
      'accessSecret',
    ],
    censor: '[REDACTED]',
  },
} satisfies Options;
