const { PrismaClient } = require('@prisma/client');
const sodium = require('libsodium-wrappers');
const prisma = new PrismaClient();

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isUpdateReady(release) {
  return Boolean(
    release
      && isHttpsUrl(release.download_url)
      && typeof release.update_signature === 'string'
      && release.update_signature.trim()
  );
}

function assertUpdateReady(release) {
  if (!isHttpsUrl(release.download_url)) {
    throw {
      statusCode: 400,
      code: 'UPDATE_ARTIFACT_REQUIRED',
      message: 'Cần URL HTTPS trực tiếp đến file updater trước khi phát hành Current'
    };
  }
  if (!release.update_signature?.trim()) {
    throw {
      statusCode: 400,
      code: 'UPDATE_SIGNATURE_REQUIRED',
      message: 'Cần dán đầy đủ nội dung file .sig của Tauri trước khi phát hành Current'
    };
  }
}

function isVersion(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

class ReleaseService {
  async getReleaseBuildConfig() {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'upstream_sync_config' } });
    const value = config?.value || {};
    return {
      token: value.github_token || process.env.GITHUB_TOKEN || '',
      repository: value.origin_repo || 'cuong-under/CloginStudio',
      branch: value.release_branch || 'refactor/code-organization'
    };
  }

  async getGitHubHeaders() {
    const { token } = await this.getReleaseBuildConfig();
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CloginStudio-Release-Manager',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async githubRequest(path, options = {}) {
    const headers = await this.getGitHubHeaders();
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    if (response.ok) return response;

    const detail = await response.json().catch(() => ({}));
    throw {
      statusCode: response.status === 401 || response.status === 403 ? 403 : 502,
      code: 'GITHUB_API_ERROR',
      message: detail.message || `GitHub API trả về lỗi ${response.status}`
    };
  }

  async getUpdaterSigningStatus() {
    const { repository } = await this.getReleaseBuildConfig();
    try {
      const response = await this.githubRequest(`/repos/${repository}/actions/secrets?per_page=100`);
      const names = new Set((await response.json()).secrets?.map((secret) => secret.name) || []);
      return {
        configured: names.has('TAURI_SIGNING_PRIVATE_KEY'),
        has_password: names.has('TAURI_SIGNING_PRIVATE_KEY_PASSWORD'),
        can_manage: true
      };
    } catch (error) {
      if (error.statusCode === 403) {
        return { configured: false, has_password: false, can_manage: false };
      }
      throw error;
    }
  }

  async setGitHubActionSecret(name, value) {
    const { repository } = await this.getReleaseBuildConfig();
    const keyResponse = await this.githubRequest(`/repos/${repository}/actions/secrets/public-key`);
    const publicKey = await keyResponse.json();
    await sodium.ready;
    const encryptedValue = sodium.to_base64(
      sodium.crypto_box_seal(
        sodium.from_string(value),
        sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL)
      ),
      sodium.base64_variants.ORIGINAL
    );
    await this.githubRequest(`/repos/${repository}/actions/secrets/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypted_value: encryptedValue, key_id: publicKey.key_id })
    });
  }

  async validateSigningKey(privateKey) {
    await sodium.ready;
    const privateKeyLine = privateKey.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
    const decoded = sodium.from_base64(privateKeyLine, sodium.base64_variants.ORIGINAL);
    const privateKeyDocument = sodium.to_string(decoded);
    const privateKeyPayload = privateKeyDocument.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
    const privateKeyBytes = sodium.from_base64(privateKeyPayload, sodium.base64_variants.ORIGINAL);
    const marker = sodium.from_string('Ed');
    const keyOffset = privateKeyBytes.findIndex((_, index) => privateKeyBytes.slice(index, index + marker.length).every((byte, markerIndex) => byte === marker[markerIndex]));
    if (keyOffset < 0 || privateKeyBytes.length < keyOffset + 74) {
      throw { statusCode: 400, code: 'INVALID_SIGNING_KEY', message: 'Private key Tauri không đúng định dạng minisign' };
    }
  }

  async configureUpdaterSigning({ private_key, password = '' }) {
    if (!private_key?.trim()) {
      throw { statusCode: 400, code: 'SIGNING_KEY_REQUIRED', message: 'Cần private key Tauri để ký updater' };
    }
    await this.validateSigningKey(private_key);
    await this.setGitHubActionSecret('TAURI_SIGNING_PRIVATE_KEY', private_key.trim());
    const { repository } = await this.getReleaseBuildConfig();
    if (password) {
      await this.setGitHubActionSecret('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', password);
    } else {
      await this.githubRequest(`/repos/${repository}/actions/secrets/TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, { method: 'DELETE' });
    }
    return this.getUpdaterSigningStatus();
  }

  async getRepositoryFile(repository, branch, path) {
    const response = await this.githubRequest(
      `/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`
    );
    const file = await response.json();
    return {
      sha: file.sha,
      content: Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')
    };
  }

  updateVersionFiles(files, version) {
    const packageJson = JSON.parse(files.get('package.json').content);
    packageJson.version = version;

    const packageLock = JSON.parse(files.get('package-lock.json').content);
    packageLock.version = version;
    if (packageLock.packages?.['']) packageLock.packages[''].version = version;

    const cargoToml = files.get('src-tauri/Cargo.toml').content.replace(
      /^(version\s*=\s*")[^"]+("\s*)$/m,
      `$1${version}$2`
    );
    const tauriConfig = JSON.parse(files.get('src-tauri/tauri.conf.json').content);
    tauriConfig.version = version;

    return new Map([
      ['package.json', `${JSON.stringify(packageJson, null, 2)}\n`],
      ['package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`],
      ['src-tauri/Cargo.toml', cargoToml],
      ['src-tauri/tauri.conf.json', `${JSON.stringify(tauriConfig, null, 2)}\n`]
    ]);
  }

  async startBuild(id) {
    const release = await prisma.release.findUnique({ where: { id } });
    if (!release) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Release không tồn tại' };
    if (!isVersion(release.version)) {
      throw { statusCode: 400, code: 'INVALID_VERSION', message: 'Phiên bản phải theo SemVer, ví dụ 1.1.11' };
    }
    if (release.is_current) {
      throw { statusCode: 400, code: 'CURRENT_RELEASE', message: 'Không thể build lại Release Current' };
    }
    if (['queued', 'building'].includes(release.build_status)) {
      throw { statusCode: 409, code: 'BUILD_IN_PROGRESS', message: 'Release này đang được GitHub Actions build' };
    }

    const { token, repository, branch } = await this.getReleaseBuildConfig();
    if (!token) {
      throw {
        statusCode: 400,
        code: 'GITHUB_TOKEN_REQUIRED',
        message: 'Chưa có GitHub Token cho Portal. Vào Releases > Đồng bộ Upstream, dán fine-grained token có Contents: Read and write và Actions: Read and write, sau đó bấm Lưu cấu hình.'
      };
    }
    const signing = await this.getUpdaterSigningStatus();
    if (!signing.can_manage) {
      throw {
        statusCode: 400,
        code: 'GITHUB_TOKEN_SCOPE_REQUIRED',
        message: 'GitHub Token chưa có quyền Actions Secrets. Tạo fine-grained token có Contents: Read and write, Actions: Read and write rồi lưu tại Releases > Đồng bộ Upstream.'
      };
    }
    if (!signing.configured) {
      throw {
        statusCode: 400,
        code: 'UPDATER_SIGNING_NOT_CONFIGURED',
        message: 'Chưa cấu hình private key ký updater. Mở Cấu hình ký updater trong Releases và dán private key Tauri tương ứng với public key của app.'
      };
    }

    const tag = `v${release.version}`;
    const tagCheck = await fetch(`https://api.github.com/repos/${repository}/git/ref/tags/${tag}`, {
      headers: await this.getGitHubHeaders()
    });
    if (tagCheck.ok) {
      throw { statusCode: 409, code: 'TAG_EXISTS', message: `Tag ${tag} đã tồn tại trên GitHub` };
    }
    if (tagCheck.status !== 404) {
      const detail = await tagCheck.json().catch(() => ({}));
      throw { statusCode: 502, code: 'GITHUB_API_ERROR', message: detail.message || 'Không thể kiểm tra tag GitHub' };
    }

    const branchRef = await this.githubRequest(`/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`).catch((error) => {
      if (error.statusCode === 502) {
        throw {
          statusCode: 400,
          code: 'RELEASE_BRANCH_NOT_FOUND',
          message: `Không tìm thấy nhánh phát hành "${branch}" trên ${repository}. Vào Releases > Đồng bộ Upstream để sửa Release Branch.`
        };
      }
      throw error;
    });
    const baseCommitSha = (await branchRef.json()).object.sha;
    const baseCommit = await this.githubRequest(`/repos/${repository}/git/commits/${baseCommitSha}`);
    const baseTreeSha = (await baseCommit.json()).tree.sha;

    const paths = ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json'];
    const files = new Map();
    for (const path of paths) files.set(path, await this.getRepositoryFile(repository, branch, path));
    const updatedFiles = this.updateVersionFiles(files, release.version);

    const tree = [];
    for (const [path, content] of updatedFiles) {
      const blobResponse = await this.githubRequest(`/repos/${repository}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, encoding: 'utf-8' })
      });
      const blob = await blobResponse.json();
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const treeResponse = await this.githubRequest(`/repos/${repository}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree })
    });
    const nextTree = await treeResponse.json();
    const commitResponse = await this.githubRequest(`/repos/${repository}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(release): v${release.version}`,
        tree: nextTree.sha,
        parents: [baseCommitSha]
      })
    });
    const commit = await commitResponse.json();

    await this.githubRequest(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
    await this.githubRequest(`/repos/${repository}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: commit.sha })
    });

    const updatedRelease = await prisma.release.update({
      where: { id },
      data: {
        build_status: 'queued',
        build_commit_sha: commit.sha,
        source_branch: branch,
        build_error: null,
        build_started_at: new Date()
      }
    });
    return { release: updatedRelease, tag, commit_sha: commit.sha, source_branch: branch };
  }

  async getBuildStatus(id) {
    const release = await prisma.release.findUnique({ where: { id } });
    if (!release) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Release không tồn tại' };
    if (!release.build_commit_sha || !['queued', 'building'].includes(release.build_status)) return release;

    const { repository } = await this.getReleaseBuildConfig();
    const runsResponse = await this.githubRequest(
      `/repos/${repository}/actions/runs?event=push&head_sha=${release.build_commit_sha}&per_page=20`
    );
    const data = await runsResponse.json();
    const run = (data.workflow_runs || []).find((item) => item.name === 'Release');
    if (!run) return release;

    if (run.status !== 'completed') {
      return prisma.release.update({
        where: { id },
        data: { build_status: 'building', build_run_id: String(run.id) }
      });
    }
    if (run.conclusion !== 'success') {
      return prisma.release.update({
        where: { id },
        data: {
          build_status: 'failed',
          build_run_id: String(run.id),
          build_error: `GitHub Actions build thất bại: ${run.html_url}`
        }
      });
    }

    try {
      const result = await this.importGitHubRelease({
        version: release.version,
        channel: release.channel,
        changelog: release.changelog,
        min_version: release.min_version || ''
      });
      return prisma.release.update({
        where: { id },
        data: {
          build_status: 'ready',
          build_run_id: String(run.id),
          build_error: null,
          download_url: result.release.download_url,
          update_signature: result.release.update_signature
        }
      });
    } catch (error) {
      return prisma.release.update({
        where: { id },
        data: {
          build_status: 'building',
          build_run_id: String(run.id),
          build_error: error.message || 'Đang chờ artifact updater từ GitHub Release'
        }
      });
    }
  }

  async importGitHubRelease({ version, channel = 'stable', changelog = '', min_version = '' }) {
    const normalizedVersion = version?.trim().replace(/^v/i, '');
    if (!normalizedVersion) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu phiên bản GitHub Release cần nhập' };
    }

    const headers = await this.getGitHubHeaders();
    const response = await fetch(
      `https://api.github.com/repos/cuong-under/CloginStudio/releases/tags/v${encodeURIComponent(normalizedVersion)}`,
      { headers }
    );
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw {
        statusCode: response.status === 404 ? 404 : 502,
        code: 'GITHUB_RELEASE_NOT_FOUND',
        message: detail.message || `Không tìm thấy GitHub Release v${normalizedVersion}`
      };
    }

    const githubRelease = await response.json();
    if (githubRelease.draft) {
      throw {
        statusCode: 400,
        code: 'GITHUB_RELEASE_DRAFT',
        message: 'GitHub Release vẫn là Draft. Hãy publish release trước khi nhập.'
      };
    }

    const updaterArtifact = (githubRelease.assets || []).find((asset) => /\.nsis\.zip$/i.test(asset.name));
    const signatureAsset = updaterArtifact && (githubRelease.assets || []).find(
      (asset) => asset.name === `${updaterArtifact.name}.sig`
    );
    if (!updaterArtifact || !signatureAsset) {
      throw {
        statusCode: 400,
        code: 'GITHUB_UPDATER_ARTIFACT_MISSING',
        message: 'GitHub Release phải có Windows updater .nsis.zip và file .nsis.zip.sig tương ứng'
      };
    }

    const signatureResponse = await fetch(signatureAsset.browser_download_url, { headers });
    const updateSignature = (await signatureResponse.text()).trim();
    if (!signatureResponse.ok || !updateSignature) {
      throw {
        statusCode: 502,
        code: 'GITHUB_SIGNATURE_FETCH_FAILED',
        message: 'Không thể tải nội dung chữ ký .sig từ GitHub Release'
      };
    }

    const data = {
      version: normalizedVersion,
      channel,
      changelog: changelog.trim() || githubRelease.body || `Phiên bản Clogin Studio v${normalizedVersion}`,
      download_url: updaterArtifact.browser_download_url,
      update_signature: updateSignature,
      min_version: min_version.trim() || null
    };
    assertUpdateReady(data);

    const existing = await prisma.release.findUnique({ where: { version: normalizedVersion } });
    const release = existing
      ? await prisma.release.update({ where: { id: existing.id }, data })
      : await prisma.release.create({ data: { ...data, is_current: false } });

    return {
      release,
      artifact_name: updaterArtifact.name,
      github_release_url: githubRelease.html_url
    };
  }

  async getLatestRelease() {
    const release = await prisma.release.findFirst({
      where: { is_current: true },
      orderBy: { published_at: 'desc' }
    });

    if (!isUpdateReady(release)) return null;

    return {
      latest: release.version,
      url: release.download_url,
      changelog: release.changelog || `Phiên bản phát hành Clogin Studio v${release.version}`
    };
  }

  async listReleases() {
    const releases = await prisma.release.findMany({
      orderBy: { published_at: 'desc' }
    });
    return { data: releases, releases };
  }

  /**
   * Manifest cho Tauri auto-updater (tauri-plugin-updater).
   *
   * Chỉ trả manifest nếu release Current có đủ updater artifact và chữ ký.
   * Tauri cần URL trực tiếp đến artifact đã ký cùng nguyên văn nội dung `.sig`.
   */
  async getUpdateManifest() {
    const release = await prisma.release.findFirst({
      where: { is_current: true },
      orderBy: { published_at: 'desc' }
    });
    if (!isUpdateReady(release)) return null;

    return {
      version: release.version,
      notes: release.changelog || `Phiên bản Clogin Studio v${release.version}`,
      pub_date: release.published_at.toISOString(),
      url: release.download_url,
      signature: release.update_signature.trim()
    };
  }

  async createRelease({ version, channel = 'stable', changelog = '', download_url, update_signature = '', min_version, is_current = false }) {
    if (!version) throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu thông tin phiên bản' };
    if (download_url && !isHttpsUrl(download_url)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Link updater phải là URL HTTPS hợp lệ' };
    }

    const data = {
      version: version.trim(),
      channel,
      changelog,
      download_url: download_url?.trim() || null,
      update_signature: update_signature.trim() || null,
      min_version: min_version?.trim() || null,
      is_current
    };

    if (is_current) {
      assertUpdateReady(data);
      await prisma.release.updateMany({
        data: { is_current: false }
      });
    }

    const release = await prisma.release.create({
      data
    });

    return release;
  }

  async updateRelease(id, data) {
    const existing = await prisma.release.findUnique({ where: { id } });
    if (!existing) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Release không tồn tại' };

    const next = {
      ...existing,
      version: data.version?.trim() || existing.version,
      channel: data.channel || existing.channel,
      changelog: data.changelog ?? existing.changelog,
      download_url: data.download_url === undefined ? existing.download_url : (data.download_url?.trim() || null),
      update_signature: data.update_signature === undefined ? existing.update_signature : (data.update_signature?.trim() || null),
      min_version: data.min_version === undefined ? existing.min_version : (data.min_version?.trim() || null),
      is_current: data.is_current ?? existing.is_current
    };
    if (next.download_url && !isHttpsUrl(next.download_url)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Link updater phải là URL HTTPS hợp lệ' };
    }

    if (next.is_current) {
      assertUpdateReady(next);
      await prisma.release.updateMany({
        where: { id: { not: id } },
        data: { is_current: false }
      });
    }

    return prisma.release.update({
      where: { id },
      data: {
        version: next.version,
        channel: next.channel,
        changelog: next.changelog,
        download_url: next.download_url,
        update_signature: next.update_signature,
        min_version: next.min_version,
        is_current: next.is_current
      }
    });
  }

  async deleteRelease(id) {
    await prisma.release.delete({ where: { id } });
    return { success: true };
  }

  async publishRelease(id) {
    const releaseToPublish = await prisma.release.findUnique({ where: { id } });
    if (!releaseToPublish) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Release không tồn tại' };
    assertUpdateReady(releaseToPublish);

    await prisma.release.updateMany({
      data: { is_current: false }
    });

    const release = await prisma.release.update({
      where: { id },
      data: {
        is_current: true,
        published_at: new Date()
      }
    });

    return release;
  }
}

module.exports = new ReleaseService();
