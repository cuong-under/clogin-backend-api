const { PrismaClient } = require('@prisma/client');
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

class ReleaseService {
  async getGitHubHeaders() {
    const config = await prisma.systemConfig.findUnique({ where: { key: 'upstream_sync_config' } });
    const token = config?.value?.github_token || process.env.GITHUB_TOKEN;
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CloginStudio-Release-Manager',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
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

    assertUpdateReady(data);

    if (is_current) {
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
    if (!isHttpsUrl(next.download_url)) {
      throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Link updater phải là URL HTTPS hợp lệ' };
    }
    assertUpdateReady(next);

    if (next.is_current) {
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
