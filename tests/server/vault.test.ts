import { describe, it, expect } from 'vitest';
import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  Vault,
} from '../../server/src/crypto/vault.ts';

describe('crypto vault', () => {
  it('派生密钥对相同口令+盐确定且不同口令不同', () => {
    const salt = generateSalt();
    const k1 = deriveKey('password123', salt);
    const k2 = deriveKey('password123', salt);
    const k3 = deriveKey('different', salt);
    expect(Buffer.compare(k1, k2)).toBe(0);
    expect(Buffer.compare(k1, k3)).not.toBe(0);
    expect(k1.length).toBe(32);
  });

  it('加密后解密可还原明文', () => {
    const key = deriveKey('secret', generateSalt());
    const blob = encrypt(key, 'hello 抖音 🔥');
    expect(blob.ciphertext).not.toContain('hello');
    expect(decrypt(key, blob)).toBe('hello 抖音 🔥');
  });

  it('密钥错误时解密抛错（防篡改/防误密）', () => {
    const salt = generateSalt();
    const blob = encrypt(deriveKey('right', salt), 'payload');
    const wrong = deriveKey('wrong', salt);
    expect(() => decrypt(wrong, blob)).toThrow();
  });

  it('Vault 实例持有密钥后可加解密', () => {
    const salt = generateSalt();
    const v = new Vault();
    v.setKey(deriveKey('p', salt));
    const blob = v.encrypt('abc');
    expect(v.decrypt(blob)).toBe('abc');
    expect(v.isReady).toBe(true);
  });
});
