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
      target_branch: val.target_branch || 'main',
      release_branch: val.release_branch || 'refactor/code-organization'
    };
  }

  async updateConfig(data) {
    const current = await this.getConfig();
    const newConfig = {
      github_token: data.github_token !== undefined ? data.github_token : current.github_token,
      upstream_repo: data.upstream_repo || current.upstream_repo,
      origin_repo: data.origin_repo || current.origin_repo,
      target_branch: data.target_branch || current.target_branch,
      release_branch: data.release_branch || current.release_branch
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
      // 1. Lấy thông tin workflow run gần nhất và PRs đang mở
      const [runsRes, pullsRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${config.origin_repo}/actions/workflows/sync-upstream.yml/runs?per_page=1`, { headers }).catch(() => null),
        fetch(`https://api.github.com/repos/${config.origin_repo}/pulls?state=open&per_page=5`, { headers }).catch(() => null)
      ]);

      let latestWorkflowRun = null;
      if (runsRes && runsRes.ok) {
        const runsData = await runsRes.json().catch(() => ({}));
        const run = (runsData.workflow_runs || [])[0];
        if (run) {
          latestWorkflowRun = {
            id: run.id,
            name: run.name,
            status: run.status,
            conclusion: run.conclusion,
            html_url: run.html_url,
            created_at: run.created_at,
            updated_at: run.updated_at
          };
        }
      }

      let activePr = null;
      if (pullsRes && pullsRes.ok) {
        const pullsData = await pullsRes.json().catch(() => []);
        if (Array.isArray(pullsData)) {
          const syncPr = pullsData.find(p =>
            p.title?.toLowerCase().includes('sync') ||
            p.head?.ref?.toLowerCase().includes('sync')
          );
          if (syncPr) {
            activePr = {
              number: syncPr.number,
              title: syncPr.title,
              html_url: syncPr.html_url,
              state: syncPr.state,
              head: syncPr.head?.ref,
              created_at: syncPr.created_at
            };
          }
        }
      }

      // 2. Fetch danh sách commit của origin và upstream để tính toán độ lệch commit (behind_by)
      const [originRes, upstreamRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${config.origin_repo}/commits?sha=${config.target_branch}&per_page=100`, { headers }).catch(() => null),
        fetch(`https://api.github.com/repos/${config.upstream_repo}/commits?sha=main&per_page=100`, { headers }).catch(() => null)
      ]);

      if (upstreamRes && upstreamRes.ok) {
        const upstreamCommits = await upstreamRes.json();
        let originCommits = [];
        if (originRes && originRes.ok) {
          originCommits = await originRes.json();
        } else if (originRes && (originRes.status === 401 || originRes.status === 403)) {
          return {
            status: 'UNAUTHORIZED',
            behind_by: 0,
            ahead_by: 0,
            last_checked: new Date().toISOString(),
            message: `Không có quyền truy cập repo '${config.origin_repo}'. Vui lòng kiểm tra lại GitHub Token trong Cấu Hình.`,
            latest_workflow_run: latestWorkflowRun,
            active_pr: activePr
          };
        }

        const originShas = new Set();
        const originSignatures = new Set();

        originCommits.forEach(c => {
          if (c.sha) {
            originShas.add(c.sha);
            originShas.add(c.sha.substring(0, 7));
          }
          const authorName = (c.commit?.author?.name || '').trim().toLowerCase();
          const date = c.commit?.author?.date || '';
          const msg = (c.commit?.message || '').trim().toLowerCase();
          if (date) {
            originSignatures.add(`${authorName}||${date}||${msg}`);
          }
        });

        // Tìm commit đầu tiên của upstream đã xuất hiện trong lịch sử của origin
        let matchIndex = upstreamCommits.findIndex(c => {
          const uSha = c.sha;
          const uShortSha = c.sha ? c.sha.substring(0, 7) : '';
          const uAuthorName = (c.commit?.author?.name || '').trim().toLowerCase();
          const uDate = c.commit?.author?.date || '';
          const uMsg = (c.commit?.message || '').trim().toLowerCase();
          const uSig = `${uAuthorName}||${uDate}||${uMsg}`;

          return originShas.has(uSha) || originShas.has(uShortSha) || originSignatures.has(uSig);
        });

        let behindBy = 0;
        let status = 'UP_TO_DATE';

        if (matchIndex === -1) {
          behindBy = upstreamCommits.length;
          status = 'BEHIND';
        } else if (matchIndex > 0) {
          behindBy = matchIndex;
          status = 'BEHIND';
        } else {
          behindBy = 0;
          status = 'UP_TO_DATE';
        }

        return {
          status,
          behind_by: behindBy,
          ahead_by: 0,
          last_checked: new Date().toISOString(),
          total_commits: upstreamCommits.length,
          commits: upstreamCommits.slice(0, behindBy > 0 ? behindBy : 10).map(c => ({
            sha: c.sha.substring(0, 7),
            full_sha: c.sha,
            message: c.commit.message,
            author: c.commit.author?.name || c.author?.login || 'Unknown',
            avatar_url: c.author?.avatar_url || '',
            date: c.commit.author?.date,
            html_url: c.html_url
          })),
          latest_workflow_run: latestWorkflowRun,
          active_pr: activePr
        };
      }

      return {
        status: 'ERROR',
        behind_by: 0,
        ahead_by: 0,
        last_checked: new Date().toISOString(),
        message: 'Không thể kết nối đến GitHub API',
        latest_workflow_run: latestWorkflowRun,
        active_pr: activePr
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

    const commitsUrl = `https://api.github.com/repos/${config.upstream_repo}/commits?per_page=30`;
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

    // Kích hoạt workflow sync-upstream.yml
    try {
      const listWfUrl = `https://api.github.com/repos/${config.origin_repo}/actions/workflows`;
      const listRes = await fetch(listWfUrl, { headers });
      if (listRes.ok) {
        const wfData = await listRes.json();
        const syncWf = (wfData.workflows || []).find(w =>
          w.path.includes('sync') || w.name.toLowerCase().includes('sync')
        );

        const wfId = syncWf ? syncWf.id : 'sync-upstream.yml';
        const workflowUrl = `https://api.github.com/repos/${config.origin_repo}/actions/workflows/${wfId}/dispatches`;

        const wfRes = await fetch(workflowUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: config.target_branch })
        });

        if (wfRes.status === 204) {
          return {
            success: true,
            message: `Đã kích hoạt GitHub Action (${syncWf ? syncWf.name : 'Sync Upstream'}) tự động gộp code từ ${config.upstream_repo} và tạo Pull Request!`,
            via_workflow: true,
            action_url: `https://github.com/${config.origin_repo}/actions/workflows/${wfId}`
          };
        } else {
          const wfErr = await wfRes.json().catch(() => ({}));
          throw new Error(wfErr.message || `Workflow dispatch status ${wfRes.status}`);
        }
      }
    } catch (err) {
      throw {
        statusCode: 400,
        code: 'SYNC_FAILED',
        message: `Không thể kích hoạt GitHub Action: ${err.message || 'Lỗi không xác định'}`
      };
    }
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
