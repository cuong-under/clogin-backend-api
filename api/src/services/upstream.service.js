const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIG_KEY = 'upstream_sync_config';
const DEFAULT_UPSTREAM = 'ProxyShard/ShardBrowser';
const DEFAULT_ORIGIN = 'cuong-under/CloginStudio';

class UpstreamService {
  async getConfig() {
    const configRow = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    const val = configRow ? configRow.value : {};
    return {
      github_token: val.github_token || process.env.GITHUB_TOKEN || '',
      upstream_repo: val.upstream_repo || DEFAULT_UPSTREAM,
      origin_repo: val.origin_repo || DEFAULT_ORIGIN,
      target_branch: val.target_branch || 'main'
    };
  }

  async updateConfig(data) {
    const current = await this.getConfig();
    const newConfig = {
      github_token: data.github_token !== undefined ? data.github_token : current.github_token,
      upstream_repo: data.upstream_repo || current.upstream_repo,
      origin_repo: data.origin_repo || current.origin_repo,
      target_branch: data.target_branch || current.target_branch
    };

    await prisma.systemConfig.upsert({
      where: { key: CONFIG_KEY },
      update: { value: newConfig, updated_at: new Date() },
      create: { key: CONFIG_KEY, value: newConfig }
    });

    return newConfig;
  }

  async getHeaders(config) {
    const token = config.github_token || process.env.GITHUB_TOKEN;
    const headers = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'CloginStudio-Admin-Portal',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async getUpstreamStatus() {
    const config = await this.getConfig();
    const headers = await this.getHeaders(config);

    try {
      // Fetch compare status between origin and upstream
      // GitHub API compare format: /repos/{owner}/{repo}/compare/{basehead}
      // basehead: {base}...{head} where head can be owner:branch
      const upstreamOwner = config.upstream_repo.split('/')[0];
      const compareUrl = `https://api.github.com/repos/${config.origin_repo}/compare/${config.target_branch}...${upstreamOwner}:${config.target_branch}`;

      const res = await fetch(compareUrl, { headers });

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'UNAUTHORIZED',
          behind_by: 0,
          ahead_by: 0,
          last_checked: new Date().toISOString(),
          message: 'GitHub Access Token không hợp lệ hoặc thiếu quyền hạn'
        };
      }

      if (!res.ok) {
        // Fallback: Try fetching upstream commits directly
        const commitsUrl = `https://api.github.com/repos/${config.upstream_repo}/commits?per_page=10`;
        const commitsRes = await fetch(commitsUrl, { headers });
        if (commitsRes.ok) {
          const commits = await commitsRes.json();
          return {
            status: 'AVAILABLE',
            behind_by: commits.length,
            ahead_by: 0,
            last_checked: new Date().toISOString(),
            latest_upstream_commit: commits[0] ? {
              sha: commits[0].sha.substring(0, 7),
              message: commits[0].commit.message,
              author: commits[0].commit.author.name,
              date: commits[0].commit.author.date
            } : null
          };
        }
        return {
          status: 'ERROR',
          behind_by: 0,
          ahead_by: 0,
          last_checked: new Date().toISOString(),
          message: 'Không thể kết nối đến GitHub API'
        };
      }

      const data = await res.json();
      return {
        status: data.behind_by > 0 ? 'BEHIND' : 'UP_TO_DATE',
        behind_by: data.behind_by || 0,
        ahead_by: data.ahead_by || 0,
        status_text: data.status,
        last_checked: new Date().toISOString(),
        total_commits: data.total_commits || 0,
        commits: (data.commits || []).slice(0, 10).map(c => ({
          sha: c.sha.substring(0, 7),
          full_sha: c.sha,
          message: c.commit.message,
          author: c.commit.author?.name || c.author?.login || 'Unknown',
          date: c.commit.author?.date,
          html_url: c.html_url
        }))
      };
    } catch (err) {
      return {
        status: 'ERROR',
        behind_by: 0,
        ahead_by: 0,
        last_checked: new Date().toISOString(),
        message: err.message || 'Lỗi kết nối API GitHub'
      };
    }
  }

  async listUpstreamCommits() {
    const config = await this.getConfig();
    const headers = await this.getHeaders(config);

    const commitsUrl = `https://api.github.com/repos/${config.upstream_repo}/commits?per_page=20`;
    const res = await fetch(commitsUrl, { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { statusCode: res.status, code: 'GITHUB_API_ERROR', message: err.message || 'Lỗi lấy danh sách commit từ Upstream' };
    }

    const commits = await res.json();
    const formatted = commits.map(c => ({
      sha: c.sha.substring(0, 7),
      full_sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name || c.author?.login || 'Unknown',
      avatar_url: c.author?.avatar_url || '',
      date: c.commit.author?.date,
      html_url: c.html_url
    }));

    return { data: formatted, commits: formatted };
  }

  async createSyncPullRequest() {
    const config = await this.getConfig();
    const headers = await this.getHeaders(config);

    const upstreamOwner = config.upstream_repo.split('/')[0];
    const url = `https://api.github.com/repos/${config.origin_repo}/pulls`;

    const body = {
      title: `sync: pull updates from upstream ${config.upstream_repo}`,
      head: `${upstreamOwner}:${config.target_branch}`,
      base: config.target_branch,
      body: `Tự động tạo Pull Request đồng bộ cập nhật mới nhất từ kho nguồn ${config.upstream_repo} qua Clogin Admin Portal.`
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 422 && data.errors?.[0]?.message?.includes('A pull request already exists')) {
        throw { statusCode: 409, code: 'PR_EXISTS', message: 'Đã có Pull Request đồng bộ đang mở trên GitHub.' };
      }
      throw { statusCode: res.status, code: 'GITHUB_API_ERROR', message: data.message || 'Không thể tạo Pull Request trên GitHub' };
    }

    return {
      success: true,
      pr_number: data.number,
      pr_url: data.html_url,
      title: data.title,
      state: data.state
    };
  }

  async triggerReleaseWorkflow() {
    const config = await this.getConfig();
    const headers = await this.getHeaders(config);

    const url = `https://api.github.com/repos/${config.origin_repo}/actions/workflows/release.yml/dispatches`;
    const body = {
      ref: config.target_branch
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (res.status === 204) {
      return {
        success: true,
        message: 'Đã kích hoạt GitHub Actions build release mới thành công!'
      };
    }

    const data = await res.json().catch(() => ({}));
    throw { statusCode: res.status, code: 'GITHUB_API_ERROR', message: data.message || 'Không thể kích hoạt GitHub Actions workflow' };
  }
}

module.exports = new UpstreamService();
