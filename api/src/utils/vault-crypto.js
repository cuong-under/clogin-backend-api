const crypto = require('crypto');

// Proxy Vault: server-managed envelope encryption. Credentials encrypted with a
// per-record DEK (AES-256-GCM), DEK wrapped by PROXY_VAULT_MASTER_KEY (32 bytes).
// Plaintext never touches PostgreSQL or logs; resolve emits only over TLS.

const AAD = Buffer.from('clogin-proxy-vault:v2');

function isConfigured() {
  const key = process.env.PROXY_VAULT_MASTER_KEY;
  return !!key && Buffer.byteLength(key, 'utf8') === 32;
}

function assertMasterKey() {
  if (!process.env.PROXY_VAULT_MASTER_KEY || Buffer.byteLength(process.env.PROXY_VAULT_MASTER_KEY, 'utf8') !== 32) {
    throw new Error('ProxyVault: PROXY_VAULT_MASTER_KEY phải có đúng 32 bytes. Server từ chối khởi động.');
  }
  return Buffer.from(process.env.PROXY_VAULT_MASTER_KEY, 'utf8');
}

function encryptCredential(credential) {
  const master = assertMasterKey();
  const plaintext = Buffer.from(JSON.stringify(credential), 'utf8');
  const dek = crypto.randomBytes(32);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, nonce);
  cipher.setAAD(Buffer.from(AAD));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const dekNonce = crypto.randomBytes(12);
  const dekCipher = crypto.createCipheriv('aes-256-gcm', master, dekNonce);
  dekCipher.setAAD(Buffer.from(AAD));
  const dekCt = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  return {
    ciphertext: ct.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
    encrypted_dek: dekCt.toString('base64'),
    dek_nonce: dekNonce.toString('base64'),
    dek_tag: dekTag.toString('base64'),
    key_version: 2
  };
}

function decryptCredential(record) {
  const master = assertMasterKey();
  const dekCipher = crypto.createDecipheriv('aes-256-gcm', master, Buffer.from(record.dek_nonce, 'base64'));
  dekCipher.setAAD(Buffer.from(AAD));
  dekCipher.setAuthTag(Buffer.from(record.dek_tag, 'base64'));
  const dek = Buffer.concat([dekCipher.update(Buffer.from(record.encrypted_dek, 'base64')), dekCipher.final()]);

  const cipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(record.nonce, 'base64'));
  cipher.setAAD(Buffer.from(AAD));
  cipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const pt = Buffer.concat([cipher.update(Buffer.from(record.ciphertext, 'base64')), cipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

function credentialFingerprint(credential) {
  const master = assertMasterKey();
  return crypto.createHmac('sha256', master).update(JSON.stringify(credential)).digest('hex');
}

module.exports = {
  isConfigured,
  assertMasterKey,
  encryptCredential,
  decryptCredential,
  credentialFingerprint
};

