/**
 * 凭证加密「纯 Node 直跑」验证脚本（无需安装任何依赖）。
 * 运行：node --experimental-strip-types tests/server/vault.verify.mjs
 * 验证：密钥派生确定性、AES-256-GCM 加解密往返、错误密钥解密失败。
 */
import { deriveKey, encrypt, decrypt, generateSalt } from '../../server/src/crypto/vault.ts';

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('  ✗ FAIL:', msg);
  }
}

const salt = generateSalt();
const k1 = deriveKey('password123', salt);
const k2 = deriveKey('password123', salt);
assert(Buffer.compare(k1, k2) === 0, '相同口令+盐 → 派生密钥一致');
assert(k1.length === 32, '密钥长度为 256-bit');

const blob = encrypt(k1, 'hello 抖音 🔥');
assert(!blob.ciphertext.includes('hello'), '密文中不可见明文');
assert(decrypt(k1, blob) === 'hello 抖音 🔥', '解密可还原明文');

let threw = false;
try {
  decrypt(deriveKey('wrong', salt), blob);
} catch {
  threw = true;
}
assert(threw, '错误密钥解密应抛错（防篡改/防误密）');

console.log(`\n[vault.verify] 通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
