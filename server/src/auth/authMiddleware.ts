import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthDevice, AuthTokenResponse } from '../../../src/types.js';

export class AuthError extends Error {
  constructor(message: string, public readonly code = 'AUTH_ERROR', public readonly statusCode = 401) {
    super(message);
  }
}

export class SecurityManager {
  private apiKey: string;
  private jwtSecret: string;
  private enrolledDevices = new Map<string, AuthDevice>();
  private requestCounts = new Map<string, { count: number; resetAt: number }>();
  private readonly rateLimitWindowMs = 60_000;
  private readonly maxRequestsPerWindow = 120;

  constructor() {
    this.apiKey = process.env.VPS_BRIDGE_API_KEY ?? 'falcon-vps-key-2026';
    this.jwtSecret = process.env.VPS_JWT_SECRET ?? 'falcon-jwt-secret-2026-supersecure';

    // Seed with a default demo device
    this.enrollDevice('device-demo-android-01', 'Primary Android Controller');
  }

  /**
   * Constant-time comparison for API keys to prevent timing analysis attacks.
   */
  public verifyApiKey(providedKey: string): boolean {
    if (!providedKey || typeof providedKey !== 'string') return false;
    const a = Buffer.from(providedKey);
    const b = Buffer.from(this.apiKey);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Enroll a new authorized mobile device.
   */
  public enrollDevice(deviceId: string, label = 'Mobile Device'): AuthDevice {
    const now = new Date().toISOString();
    const device: AuthDevice = {
      deviceId,
      label,
      registeredAt: now,
      lastActiveAt: now,
    };
    this.enrolledDevices.set(deviceId, device);
    return device;
  }

  public getDevice(deviceId: string): AuthDevice | undefined {
    return this.enrolledDevices.get(deviceId);
  }

  public listDevices(): AuthDevice[] {
    return Array.from(this.enrolledDevices.values());
  }

  /**
   * Issue a signed JWT token for an authenticated device.
   */
  public issueToken(providedApiKey: string, deviceId: string): AuthTokenResponse {
    if (!this.verifyApiKey(providedApiKey)) {
      throw new AuthError('Invalid VPS bridge API key.', 'INVALID_API_KEY', 403);
    }

    let device = this.enrolledDevices.get(deviceId);
    if (!device) {
      device = this.enrollDevice(deviceId, `Device ${deviceId.slice(0, 8)}`);
    }
    device.lastActiveAt = new Date().toISOString();

    const expiresInSec = 86_400; // 24 hours
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: deviceId,
        iat: now,
        exp: now + expiresInSec,
        jti: randomUUID(),
      })
    ).toString('base64url');

    const signature = createHmac('sha256', this.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const token = `${header}.${payload}.${signature}`;

    return {
      token,
      expiresIn: expiresInSec,
      tokenType: 'Bearer',
      deviceId,
      issuedAt: new Date(now * 1000).toISOString(),
    };
  }

  /**
   * Verify a signed JWT token and extract payload.
   */
  public verifyToken(token: string): { sub: string; exp: number } {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthError('Malformed JWT token structure.', 'INVALID_TOKEN');
    }

    const [header, payload, signature] = parts;
    const expectedSig = createHmac('sha256', this.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSig) {
      throw new AuthError('JWT signature verification failed.', 'INVALID_SIGNATURE');
    }

    let decoded: { sub: string; exp: number };
    try {
      decoded = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8'));
    } catch {
      throw new AuthError('Failed to parse JWT payload.', 'INVALID_TOKEN');
    }

    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new AuthError('JWT token has expired.', 'TOKEN_EXPIRED');
    }

    return decoded;
  }

  /**
   * Check rate limiting for an identifier (IP or deviceId).
   */
  public checkRateLimit(key: string, limit = this.maxRequestsPerWindow): boolean {
    const now = Date.now();
    const entry = this.requestCounts.get(key);

    if (!entry || now > entry.resetAt) {
      this.requestCounts.set(key, { count: 1, resetAt: now + this.rateLimitWindowMs });
      return true;
    }

    if (entry.count >= limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Validate WebSocket handshake URL for authentication token.
   */
  public authenticateWsUrl(url: string | undefined): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url, 'http://localhost');
      const token = parsed.searchParams.get('token');
      const apiKey = parsed.searchParams.get('apiKey');

      if (apiKey && this.verifyApiKey(apiKey)) return true;
      if (token) {
        this.verifyToken(token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const securityManager = new SecurityManager();

/**
 * Express middleware requiring valid API key or Bearer JWT token.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const apiKey = (req.headers['x-api-key'] as string | undefined) ?? (req.query['apiKey'] as string | undefined);
    if (apiKey && securityManager.verifyApiKey(apiKey)) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const payload = securityManager.verifyToken(token);

      // Optional device-binding verification
      const deviceIdHeader = req.headers['x-device-id'] as string | undefined;
      if (deviceIdHeader && deviceIdHeader !== payload.sub) {
        throw new AuthError('Device ID mismatch with token binding.', 'DEVICE_MISMATCH', 403);
      }

      return next();
    }

    throw new AuthError('Authentication credentials required (x-api-key or Bearer JWT).', 'AUTH_REQUIRED');
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    res.status(401).json({ error: 'Authentication failed.', code: 'UNAUTHORIZED' });
  }
}

/**
 * Express rate limiter middleware.
 */
export function rateLimiter(limit = 120) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = (req.headers['x-device-id'] as string) || req.ip || 'unknown';
    if (!securityManager.checkRateLimit(identifier, limit)) {
      res.status(429).json({
        error: 'Too many requests. Rate limit exceeded.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }
    next();
  };
}
