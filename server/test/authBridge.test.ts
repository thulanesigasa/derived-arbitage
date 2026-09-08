import { describe, expect, it } from 'vitest';
import { SecurityManager, AuthError } from '../src/auth/authMiddleware.js';

describe('Phase 5: VPS Bridge Security & Auth', () => {
  it('verifies API keys using constant-time comparison', () => {
    const manager = new SecurityManager();
    const validKey = process.env.VPS_BRIDGE_API_KEY ?? 'falcon-vps-key-2026';

    expect(manager.verifyApiKey(validKey)).toBe(true);
    expect(manager.verifyApiKey('wrong-key-value')).toBe(false);
    expect(manager.verifyApiKey('')).toBe(false);
  });

  it('enrolls mobile devices and lists active devices', () => {
    const manager = new SecurityManager();
    const device = manager.enrollDevice('device-test-android-99', 'Pixel Test Device');

    expect(device.deviceId).toBe('device-test-android-99');
    expect(device.label).toBe('Pixel Test Device');
    expect(manager.getDevice('device-test-android-99')).toBeDefined();
    expect(manager.listDevices().some((d) => d.deviceId === 'device-test-android-99')).toBe(true);
  });

  it('issues cryptographically signed JWT tokens with device binding', () => {
    const manager = new SecurityManager();
    const validKey = process.env.VPS_BRIDGE_API_KEY ?? 'falcon-vps-key-2026';

    const tokenResponse = manager.issueToken(validKey, 'device-test-android-99');
    expect(tokenResponse.token).toBeDefined();
    expect(tokenResponse.tokenType).toBe('Bearer');
    expect(tokenResponse.deviceId).toBe('device-test-android-99');
    expect(tokenResponse.expiresIn).toBe(86400);

    // Verify token validity and payload
    const payload = manager.verifyToken(tokenResponse.token);
    expect(payload.sub).toBe('device-test-android-99');
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects token issuance with invalid API key', () => {
    const manager = new SecurityManager();
    expect(() => manager.issueToken('bad-api-key', 'device-test-android-99')).toThrow(AuthError);
  });

  it('rejects forged, malformed, or tampered JWT signatures', () => {
    const manager = new SecurityManager();
    const validKey = process.env.VPS_BRIDGE_API_KEY ?? 'falcon-vps-key-2026';
    const { token } = manager.issueToken(validKey, 'device-test-android-99');

    // Tamper with payload
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}tampered.${parts[2]}`;
    expect(() => manager.verifyToken(tamperedToken)).toThrow(/signature/i);

    // Malformed token
    expect(() => manager.verifyToken('malformed.token')).toThrow(/structure/i);
  });

  it('enforces token-bucket rate limiting', () => {
    const manager = new SecurityManager();
    const testIp = '192.168.1.100';

    // Within limit (limit 5)
    for (let i = 0; i < 5; i++) {
      expect(manager.checkRateLimit(testIp, 5)).toBe(true);
    }

    // Exceeded limit
    expect(manager.checkRateLimit(testIp, 5)).toBe(false);
  });

  it('authenticates WebSocket connection handshake URLs', () => {
    const manager = new SecurityManager();
    const validKey = process.env.VPS_BRIDGE_API_KEY ?? 'falcon-vps-key-2026';
    const { token } = manager.issueToken(validKey, 'device-test-android-99');

    // Valid API key query param
    expect(manager.authenticateWsUrl(`/ws?apiKey=${validKey}`)).toBe(true);

    // Valid JWT query param
    expect(manager.authenticateWsUrl(`/ws?token=${token}`)).toBe(true);

    // Invalid parameters
    expect(manager.authenticateWsUrl('/ws?apiKey=invalid-key')).toBe(false);
    expect(manager.authenticateWsUrl('/ws')).toBe(false);
  });
});
