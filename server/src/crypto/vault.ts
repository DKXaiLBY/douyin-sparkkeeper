/**
 * 凭证保险库（纯加密逻辑，无文件 I/O，便于无依赖单测）。
 *
 * 安全约定：
 * - 算法：AES-256-GCM（带认证标签，防篡改）。
 * - 密钥派生：PBKDF2-HMAC-SHA256，盐随机 16 字节，迭代 210000 次（OWASP 2023 推荐）。
 * - 明文（如 Playwright storage_state）仅在内存驻留，绝不明文落盘。
 * - 派生密钥不落盘，仅 salt 落盘。
 */

import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from 'node:crypto';
import type { EncryptedBlob } from '../lib/types.ts';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;
const PBKDF2_ITERATIONS = 210_000;

/** 生成 base64 盐。 */
export function generateSalt(): string {
  return randomBytes(SALT_LEN).toString('base64');
}

/** 由口令 + 盐派生 256-bit 密钥。 */
export function deriveKey(passphrase: string, salt: string): Buffer {
  const saltBuf = Buffer.from(salt, 'base64');
  return pbkdf2Sync(passphrase, saltBuf, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
}

/** 用密钥加密 UTF-8 明文，返回 base64 密文块（含 iv 与 authTag）。 */
export function encrypt(key: Buffer, plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf-8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

/** 解密，认证失败抛出（口令错误 / 数据被篡改）。 */
export function decrypt(key: Buffer, blob: EncryptedBlob): string {
  const iv = Buffer.from(blob.iv, 'base64');
  const authTag = Buffer.from(blob.authTag, 'base64');
  const data = Buffer.from(blob.ciphertext, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * 持钥保险库实例。解锁后提供 encrypt/decrypt。
 * 构造时不接受明文口令；由 CredentialStore 负责派生并注入密钥。
 */
export class Vault {
  private key: Buffer | null = null;

  /** 注入已派生密钥（内存态）。 */
  setKey(key: Buffer): void {
    this.key = key;
  }

  get isReady(): boolean {
    return this.key !== null;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error('Vault is locked. Unlock with a passphrase first.');
    }
    return this.key;
  }

  encrypt(plaintext: string): EncryptedBlob {
    return encrypt(this.requireKey(), plaintext);
  }

  decrypt(blob: EncryptedBlob): string {
    return decrypt(this.requireKey(), blob);
  }
}
