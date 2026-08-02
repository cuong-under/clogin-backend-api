const { test } = require('node:test');
const assert = require('node:assert');

process.env.PROXY_VAULT_MASTER_KEY = 'clogin-dev-master-key-0000000001';

const vc = require('../src/utils/vault-crypto');

test('encrypt/decrypt roundtrip preserves credential', () => {
  const sealed = vc.encryptCredential({ username: 'userA', password: 'pwB' });
  assert.ok(sealed.ciphertext);
  assert.ok(!sealed.ciphertext.includes('pwB'));
  const plain = vc.decryptCredential(sealed);
  assert.deepStrictEqual(plain, { username: 'userA', password: 'pwB' });
});

test('tampered ciphertext fails decryption', () => {
  const sealed = vc.encryptCredential({ username: 'u', password: 'p' });
  const tampered = { ...sealed, ciphertext: Buffer.from('AAAA', 'base64').toString('base64') };
  assert.throws(() => vc.decryptCredential(tampered));
});

test('different master key cannot decrypt', () => {
  const sealed = vc.encryptCredential({ username: 'u', password: 'p' });
  process.env.PROXY_VAULT_MASTER_KEY = 'another-master-key-00000000001';
  // 27 bytes, ensure different-but-valid 32-byte key for a clean test
  process.env.PROXY_VAULT_MASTER_KEY = '012345678901234567890123456789ab'; // 32 bytes
  assert.throws(() => vc.decryptCredential(sealed));
  process.env.PROXY_VAULT_MASTER_KEY = 'clogin-dev-master-key-0000000001';
});

test('credential_fingerprint is stable and opaque', () => {
  const f1 = vc.credentialFingerprint({ username: 'a', password: 'b' });
  const f2 = vc.credentialFingerprint({ username: 'a', password: 'b' });
  assert.strictEqual(f1, f2);
  assert.strictEqual(f1.length, 64);
  assert.ok(!f1.includes('supersecret'));
});