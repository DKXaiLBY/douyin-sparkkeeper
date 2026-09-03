/**
 * 凭证存储：导入 Cookie(storage_state) / 重登录占位 / 口令校验 / 密文落盘。
 *
 * 落盘形态（data/credentials/）：
 *   vault.salt             — base64 盐（公开但必要）
 *   vault.verifier.json    — 用口令派生密钥加密的已知哨兵，用于校验口令
 *   <id>.enc.json          — 单个平台凭证（Credential，全是密文）
 *
 * 明文 storage_state 仅在 import 时短暂驻留内存，加密后立即丢弃引用。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Vault, deriveKey, encrypt, decrypt, generateSalt } from './vault.ts';
import { AppError, ErrorCode } from '../lib/errors.ts';
import type { Credential } from '../lib/types.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('credentialStore');

const VERIFIER_SENTINEL = 'sparkkeeper-verifier-v1';
const SALT_FILE = 'vault.salt';
const VERIFIER_FILE = 'vault.verifier.json';

export class CredentialStore {
  private readonly dir: string;
  private readonly vault = new Vault();
  private salt: string | null = null;
  private unlocked = false;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'credentials');
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  // ---------------- 口令 / 解锁 ----------------

  private readSalt(): string {
    const p = path.join(this.dir, SALT_FILE);
    if (this.salt) return this.salt;
    if (existsSync(p)) {
      this.salt = readFileSync(p, 'utf-8').trim();
    } else {
      this.ensureDir();
      this.salt = generateSalt();
      writeFileSync(p, this.salt, 'utf-8');
      log.info('generated new vault salt');
    }
    return this.salt;
  }

  private verifierPath(): string {
    return path.join(this.dir, VERIFIER_FILE);
  }

  /**
   * 用口令解锁保险库。
   * - 已存在 verifier：解密校验，失败抛 INVALID_PASSPHRASE。
   * - 不存在 verifier（首次）：用该口令创建 verifier。
   * 解锁后密钥驻留内存，用于后续加解密。
   */
  unlock(passphrase: string): void {
    this.ensureDir();
    const salt = this.readSalt();
    const key = deriveKey(passphrase, salt);

    const vp = this.verifierPath();
    if (existsSync(vp)) {
      const blob = JSON.parse(readFileSync(vp, 'utf-8'));
      try {
        const plain = this.vaultDecryptWithKey(key, blob);
        if (plain !== VERIFIER_SENTINEL) {
          throw new Error('verifier mismatch');
        }
      } catch {
        throw new AppError(
          ErrorCode.INVALID_PASSPHRASE,
          '口令错误，无法解密凭证保险库',
          401,
        );
      }
    } else {
      const blob = this.vaultEncryptWithKey(key, VERIFIER_SENTINEL);
      writeFileSync(vp, JSON.stringify(blob), 'utf-8');
      log.info('created verifier with new passphrase');
    }
    this.vault.setKey(key);
    this.unlocked = true;
    log.info('vault unlocked');
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** 是否已设置过口令（verifier 存在）。首次使用时前端据此提示「请设置你自己的口令」。 */
  hasVerifier(): boolean {
    try {
      return existsSync(this.verifierPath());
    } catch {
      return false;
    }
  }

  /** 不持久化解锁状态，仅校验口令是否正确。 */
  verifyPassphrase(passphrase: string): boolean {
    this.ensureDir();
    const salt = this.readSalt();
    const key = deriveKey(passphrase, salt);
    const vp = this.verifierPath();
    if (!existsSync(vp)) return false;
    try {
      const blob = JSON.parse(readFileSync(vp, 'utf-8'));
      return this.vaultDecryptWithKey(key, blob) === VERIFIER_SENTINEL;
    } catch {
      return false;
    }
  }

  private requireUnlocked(): void {
    if (!this.unlocked) {
      throw new AppError(
        ErrorCode.VAULT_LOCKED,
        '凭证保险库未解锁，请先提供口令',
        401,
      );
    }
  }

  private vaultEncryptWithKey(key: Buffer, plaintext: string) {
    return encrypt(key, plaintext);
  }

  private vaultDecryptWithKey(
    key: Buffer,
    blob: { iv: string; authTag: string; ciphertext: string },
  ) {
    return decrypt(key, blob);
  }

  // ---------------- 导入 / 读取 ----------------

  /**
   * 导入平台 Cookie（Playwright storage_state JSON 字符串）。
   * 明文仅在此函数作用域内存在，加密后立即丢弃。
   */
  importCredential(
    storageState: string,
    opts: { platform?: 'douyin'; expiresAt?: string; passphrase?: string } = {},
  ): Credential {
    if (opts.passphrase) this.unlock(opts.passphrase);
    this.requireUnlocked();

    const id = randomUUID();
    const salt = this.readSalt();
    const blob = this.vault.encrypt(storageState);
    const cred: Credential = {
      id,
      platform: opts.platform ?? 'douyin',
      iv: blob.iv,
      authTag: blob.authTag,
      ciphertext: blob.ciphertext,
      salt,
      createdAt: new Date().toISOString(),
      expiresAt: opts.expiresAt,
    };
    this.ensureDir();
    writeFileSync(
      path.join(this.dir, `${id}.enc.json`),
      JSON.stringify(cred, null, 2),
      'utf-8',
    );
    log.info({ id: cred.id, platform: cred.platform }, 'credential imported');
    return cred;
  }

  /** 读取密文凭证（不含明文）。 */
  getCredential(id?: string): Credential {
    const files = this.listCredentialFiles();
    if (files.length === 0) {
      throw new AppError(ErrorCode.CREDENTIAL_NOT_FOUND, '尚未导入任何凭证', 404);
    }
    const target = id
      ? files.find((f) => f.id === id)
      : files[files.length - 1];
    if (!target) {
      throw new AppError(ErrorCode.CREDENTIAL_NOT_FOUND, '凭证不存在', 404);
    }
    return target;
  }

  listCredentials(): Credential[] {
    return this.listCredentialFiles();
  }

  /** 解密出明文 storage_state（仅在已解锁且确有需要时调用）。 */
  decryptCredential(id?: string): string {
    this.requireUnlocked();
    const cred = this.getCredential(id);
    return this.vault.decrypt({
      iv: cred.iv,
      authTag: cred.authTag,
      ciphertext: cred.ciphertext,
    });
  }

  deleteCredential(id: string): void {
    const p = path.join(this.dir, `${id}.enc.json`);
    if (existsSync(p)) unlinkSync(p);
  }

  /** 加密任意短文本（如 LLM apiKey），返回 base64（密文块 JSON）。 */
  encryptText(plain: string): string {
    this.requireUnlocked();
    const blob = this.vault.encrypt(plain);
    return Buffer.from(JSON.stringify(blob)).toString('base64');
  }

  /** 解密 encryptText 得到的 base64 密文。 */
  decryptText(cipherB64: string): string {
    this.requireUnlocked();
    const blob = JSON.parse(
      Buffer.from(cipherB64, 'base64').toString('utf-8'),
    ) as { iv: string; authTag: string; ciphertext: string };
    return this.vault.decrypt(blob);
  }

  /** 重登录：本应用不绕过验证码，仅清理过期凭证并告知用户需手动重新导入。 */
  requestRelogin(): { needed: boolean; message: string } {
    const creds = this.listCredentialFiles();
    if (creds.length === 0) {
      return {
        needed: true,
        message: '尚未导入凭证。请在本机浏览器登录抖音后，导出 storage_state 并导入。',
      };
    }
    const expired = creds.find(
      (c) => c.expiresAt && new Date(c.expiresAt).getTime() < Date.now(),
    );
    if (expired) {
      this.deleteCredential(expired.id);
      return {
        needed: true,
        message: '检测到凭证已过期，已移除。请重新登录抖音并导入新的 storage_state。',
      };
    }
    return { needed: false, message: '当前凭证有效，无需重登录。' };
  }

  private listCredentialFiles(): Credential[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.enc.json') && f !== VERIFIER_FILE)
      .map((f) => JSON.parse(readFileSync(path.join(this.dir, f), 'utf-8')) as Credential)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
