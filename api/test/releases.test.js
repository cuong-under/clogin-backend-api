const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const releases = new Map();

const githubResponses = new Map();
const prisma = {
  systemConfig: {
    findUnique: async () => null,
  },
  release: {
    findFirst: async ({ where } = {}) => {
      const values = [...releases.values()];
      return where?.is_current ? values.find((release) => release.is_current) || null : values[0] || null;
    },
    findUnique: async ({ where }) => releases.get(where.id) || null,
    updateMany: async ({ where, data }) => {
      for (const release of releases.values()) {
        if (!where?.id || release.id !== where.id.not) Object.assign(release, data);
      }
    },
    update: async ({ where, data }) => {
      const release = releases.get(where.id);
      Object.assign(release, data);
      return release;
    },
    create: async ({ data }) => {
      const release = { id: `release-${releases.size + 1}`, published_at: new Date(), ...data };
      releases.set(release.id, release);
      return release;
    },
    findMany: async () => [...releases.values()],
    delete: async ({ where }) => releases.delete(where.id),
  },
};

Module._load = function (request, parent, isMain) {
  if (request === '@prisma/client') return { PrismaClient: class { constructor() { return prisma; } } };
  return originalLoad.call(this, request, parent, isMain);
};
const releaseService = require('../src/services/release.service');
Module._load = originalLoad;

const originalFetch = global.fetch;
global.fetch = async (url) => {
  const response = githubResponses.get(url);
  if (!response) throw new Error(`Unexpected fetch: ${url}`);
  return response;
};

test('unconfigured Current release does not advertise an update', async () => {
  releases.clear();
  releases.set('bad', { id: 'bad', version: '1.2.0', is_current: true, download_url: 'https://github.com/release', update_signature: null });

  assert.equal(await releaseService.getLatestRelease(), null);
  assert.equal(await releaseService.getUpdateManifest(), null);
});

test('publishing requires a direct HTTPS updater artifact and signature', async () => {
  releases.clear();
  releases.set('bad', { id: 'bad', version: '1.2.0', is_current: false, download_url: 'https://github.com/release', update_signature: null });

  await assert.rejects(
    releaseService.publishRelease('bad'),
    (error) => error.code === 'UPDATE_SIGNATURE_REQUIRED'
  );
});

test('draft release can be created before updater artifact is available', async () => {
  releases.clear();

  const release = await releaseService.createRelease({
    version: '1.2.0',
    changelog: 'Chuẩn bị phát hành',
  });

  assert.equal(release.is_current, false);
  assert.equal(release.download_url, null);
  assert.equal(release.update_signature, null);
});

test('configured Current release produces the Tauri dynamic manifest', async () => {
  releases.clear();
  releases.set('ready', {
    id: 'ready',
    version: '1.2.0',
    is_current: true,
    changelog: 'Sửa lỗi updater',
    download_url: 'https://downloads.example.com/Clogin_1.2.0_x64-setup.nsis.zip',
    update_signature: 'untrusted comment: signature\nRURERURERURERURERURERURERURERURERURERURERURE=',
    published_at: new Date('2026-08-02T00:00:00.000Z'),
  });

  const manifest = await releaseService.getUpdateManifest();
  assert.deepEqual(manifest, {
    version: '1.2.0',
    notes: 'Sửa lỗi updater',
    pub_date: '2026-08-02T00:00:00.000Z',
    url: 'https://downloads.example.com/Clogin_1.2.0_x64-setup.nsis.zip',
    signature: 'untrusted comment: signature\nRURERURERURERURERURERURERURERURERURERURERURE=',
  });
});

test('GitHub import stores the signed Windows updater artifact', async () => {
  releases.clear();
  githubResponses.clear();
  const releaseUrl = 'https://api.github.com/repos/cuong-under/CloginStudio/releases/tags/v1.2.0';
  const artifactUrl = 'https://github.com/cuong-under/CloginStudio/releases/download/v1.2.0/Clogin_1.2.0_x64-setup.nsis.zip';
  const signatureUrl = `${artifactUrl}.sig`;
  githubResponses.set(releaseUrl, {
    ok: true,
    json: async () => ({
      draft: false,
      body: 'Ghi chú GitHub',
      html_url: 'https://github.com/cuong-under/CloginStudio/releases/tag/v1.2.0',
      assets: [
        { name: 'Clogin_1.2.0_x64-setup.nsis.zip', browser_download_url: artifactUrl },
        { name: 'Clogin_1.2.0_x64-setup.nsis.zip.sig', browser_download_url: signatureUrl },
      ]
    })
  });
  githubResponses.set(signatureUrl, { ok: true, text: async () => 'signed-update-artifact' });

  const result = await releaseService.importGitHubRelease({ version: 'v1.2.0' });
  assert.equal(result.release.version, '1.2.0');
  assert.equal(result.release.download_url, artifactUrl);
  assert.equal(result.release.update_signature, 'signed-update-artifact');
});

test('draft release requires GitHub signing before a build can start', async () => {
  releases.clear();
  releases.set('draft', { id: 'draft', version: '1.2.0', is_current: false, build_status: 'draft' });

  await assert.rejects(
    releaseService.startBuild('draft'),
    (error) => error.code === 'GITHUB_TOKEN_REQUIRED'
  );
});

test('signing key validation accepts a valid Tauri minisign private key', async () => {
  const privateKey = 'dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5eXQ3Z3NKSVdUOVphL1Avb1I3RG9mUFR6MjJ3aVFEUG4zZURRV3poRzN2a0FBQkFBQUFBQUFBQUFBQUlBQUFBQVB3QTlEdGFqdERTcmQwY1lnNTdZMXlRV21XYXBwZ0VqN3B6bWk2UGJ4dU01Rmd5UW82MStWa04wSkFyZWtVclB6M2EzeEc3Ynk5VUpEUFM1TUZaUlp3K1cwdWYvMTFYMklsUHo0OVp2WXdKTDRXL2o5MGZUVTljbEVFeXBOS0FDbEo4Nk5seVh5ZW89Cg==';
  await releaseService.validateSigningKey(privateKey);
});

after(() => { global.fetch = originalFetch; });
