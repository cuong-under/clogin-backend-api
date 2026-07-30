const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ReleaseService {
  async getLatestRelease() {
    const release = await prisma.release.findFirst({
      where: { is_current: true },
      orderBy: { published_at: 'desc' }
    });

    if (release) {
      return {
        latest: release.version,
        url: release.download_url || `https://github.com/cuong-under/CloginStudio/releases/tag/v${release.version}`,
        changelog: release.changelog || `Phiên bản phát hành Clogin Studio v${release.version}`
      };
    }

    // Fallback if no release entry exists in DB
    const fallbackRelease = await prisma.release.findFirst({
      orderBy: { created_at: 'desc' }
    });

    if (fallbackRelease) {
      return {
        latest: fallbackRelease.version,
        url: fallbackRelease.download_url || `https://github.com/cuong-under/CloginStudio/releases/tag/v${fallbackRelease.version}`,
        changelog: fallbackRelease.changelog || `Phiên bản phát hành Clogin Studio v${fallbackRelease.version}`
      };
    }

    return {
      latest: "0.1.10",
      url: "https://github.com/cuong-under/CloginStudio/releases/tag/v0.1.10",
      changelog: "Phiên bản phát hành Clogin Studio v0.1.10"
    };
  }

  async listReleases() {
    const releases = await prisma.release.findMany({
      orderBy: { published_at: 'desc' }
    });
    return { data: releases, releases };
  }

  async createRelease({ version, channel = 'stable', changelog = '', download_url, min_version, is_current = false }) {
    if (!version) throw { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Thiếu thông tin phiên bản' };

    if (is_current) {
      await prisma.release.updateMany({
        data: { is_current: false }
      });
    }

    const release = await prisma.release.create({
      data: {
        version,
        channel,
        changelog,
        download_url,
        min_version,
        is_current
      }
    });

    return release;
  }

  async updateRelease(id, data) {
    if (data.is_current) {
      await prisma.release.updateMany({
        where: { id: { not: id } },
        data: { is_current: false }
      });
    }

    return prisma.release.update({
      where: { id },
      data: {
        version: data.version,
        channel: data.channel,
        changelog: data.changelog,
        download_url: data.download_url,
        min_version: data.min_version,
        is_current: data.is_current
      }
    });
  }

  async deleteRelease(id) {
    await prisma.release.delete({ where: { id } });
    return { success: true };
  }

  async publishRelease(id) {
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
