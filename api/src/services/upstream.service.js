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
      release_branch: (val.release_branch === 'refactor/code-organization' ? 'main' : (val.release_branch || 'main'))
    };
  }

  async updateConfig(data) {
    const current = await this.getConfig();
    const newConfig = {
      github_token: data.github_token !== undefined ? data.github_token : current.github_token,
      upstream_repo: data.upstream_repo || current.upstream_repo,
      origin_repo: data.origin_repo || current.origin_repo,
      target_branch: data.target_branch || current.target_branch,
      release_branch: (data.release_branch === 'refactor/code-organization' ? 'main' : (data.release_branch || current.release_branch))
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
          target_branch: config.target_branch,
          last_checked: new Date().toISOString(),
          total_commits: upstreamCommits.length,
          commits: upstreamCommits.slice(0, behindBy > 0 ? behindBy : 10).map((c, index) => {
            const uSha = c.sha;
            const uShortSha = c.sha ? c.sha.substring(0, 7) : "";
            const uAuthorName = (c.commit?.author?.name || "").trim().toLowerCase();
            const uDate = c.commit?.author?.date || "";
            const uMsg = (c.commit?.message || "").trim().toLowerCase();
            const uSig = `${uAuthorName}||${uDate}||${uMsg}`;
            const directMatch = originShas.has(uSha) || originShas.has(uShortSha) || originSignatures.has(uSig);
            const isMerged = directMatch || (matchIndex !== -1 && index >= matchIndex);

            return {
              sha: uShortSha,
              full_sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name || c.author?.login || 'Unknown',
              avatar_url: c.author?.avatar_url || '',
              date: c.commit.author?.date,
              html_url: c.html_url,
              is_merged: Boolean(isMerged)
            };
          }),
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

    const [upstreamRes, originRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${config.upstream_repo}/commits?per_page=30`, { headers }).catch(() => null),
      fetch(`https://api.github.com/repos/${config.origin_repo}/commits?sha=${config.target_branch}&per_page=100`, { headers }).catch(() => null)
    ]);

    if (!upstreamRes || !upstreamRes.ok) {
      const err = upstreamRes ? await upstreamRes.json().catch(() => ({})) : {};
      throw { statusCode: upstreamRes ? upstreamRes.status : 500, code: 'GITHUB_API_ERROR', message: err.message || 'Lỗi lấy danh sách commit từ Upstream' };
    }

    const upstreamCommits = await upstreamRes.json();
    let originCommits = [];
    if (originRes && originRes.ok) {
      originCommits = await originRes.json().catch(() => []);
    }

    const originShas = new Set();
    const originSignatures = new Set();

    if (Array.isArray(originCommits)) {
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
    }

    let mergedCount = 0;
    let pendingCount = 0;

    const formatted = upstreamCommits.map((c, index) => {
      const uSha = c.sha;
      const uShortSha = c.sha ? c.sha.substring(0, 7) : "";
      const uAuthorName = (c.commit?.author?.name || "").trim().toLowerCase();
      const uDate = c.commit?.author?.date || "";
      const uMsg = (c.commit?.message || "").trim().toLowerCase();
      const uSig = `${uAuthorName}||${uDate}||${uMsg}`;
      const directMatch = originShas.has(uSha) || originShas.has(uShortSha) || originSignatures.has(uSig);
      const isMerged = directMatch || (matchIndex !== -1 && index >= matchIndex);
      if (isMerged) {
        mergedCount++;
      } else {
        pendingCount++;
      }

      return {
        sha: uShortSha,
        full_sha: c.sha,
        message: c.commit?.message || '',
        author: c.commit?.author?.name || c.author?.login || 'Unknown',
        avatar_url: c.author?.avatar_url || '',
        date: c.commit?.author?.date,
        html_url: c.html_url,
        is_merged: Boolean(isMerged)
      };
    });

    return {
      target_branch: config.target_branch,
      merged_count: mergedCount,
      pending_count: pendingCount,
      data: formatted,
      commits: formatted
    };
  }

  async createSyncPullRequest() {
    const config = await this.getConfig();
    const headers = await this.getHeaders(config);

    // 1. Kiểm tra xem đã có Pull Request sync nào đang mở sẵn chưa
    try {
      const pullsRes = await fetch(`https://api.github.com/repos/${config.origin_repo}/pulls?state=open&per_page=10`, { headers });
      if (pullsRes.ok) {
        const pulls = await pullsRes.json();
        const existingPr = pulls.find(p =>
          p.title?.toLowerCase().includes('sync') ||
          p.head?.ref?.toLowerCase().includes('sync')
        );
        if (existingPr) {
          return {
            success: true,
            pr_number: existingPr.number,
            pr_url: existingPr.html_url,
            message: `Đang có Pull Request #${existingPr.number} mở trên GitHub: "${existingPr.title}"`
          };
        }
      }
    } catch (err) {
      // bỏ qua lỗi kiểm tra PR
    }

    // 2. Kiểm tra xem có nhánh sync/upstream-* nào gần đây đã được push mà chưa có PR không
    try {
      const branchesRes = await fetch(`https://api.github.com/repos/${config.origin_repo}/branches?per_page=30`, { headers });
      if (branchesRes.ok) {
        const branches = await branchesRes.json();
        const syncBranches = branches.filter(b => b.name && b.name.startsWith('sync/upstream-'));
        if (syncBranches.length > 0) {
          const latestSyncBranch = syncBranches[syncBranches.length - 1].name;
          const prCreateRes = await fetch(`https://api.github.com/repos/${config.origin_repo}/pulls`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: `Sync Upstream: Cập nhật từ ${config.upstream_repo}`,
              head: latestSyncBranch,
              base: config.target_branch,
              body: `Tự động tạo Pull Request đồng bộ các cập nhật mới nhất từ kho nguồn ${config.upstream_repo}.\n\n- Đã bảo tồn toàn bộ thương hiệu và kiến trúc Clogin Studio.\n- Tích hợp các tính năng và bản vá mới nhất từ Upstream.`
            })
          });

          if (prCreateRes.ok) {
            const newPr = await prCreateRes.json();
            return {
              success: true,
              pr_number: newPr.number,
              pr_url: newPr.html_url,
              message: `Đã tạo Pull Request #${newPr.number} thành công từ nhánh ${latestSyncBranch}!`
            };
          }
        }
      }
    } catch (err) {
      // Tiếp tục fallback sang workflow dispatch
    }

    // 3. Dispatch workflow sync-upstream.yml
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
            message: `Đã kích hoạt GitHub Actions (${syncWf ? syncWf.name : 'Sync Upstream'}) để tự động merge và tạo Pull Request!`,
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

  async triggerReleaseWorkflow(data = {}) {
    const config = await this.getConfig();
    const releaseService = require('./release.service');

    let version = data.version ? data.version.trim().replace(/^v/i, '') : '';
    const changelog = data.changelog || 'Cập nhật từ Upstream: Chromium 152 runtime, ShardHelper, Human Mouse & Type spoofing, bug fixes.';
    let branch = data.branch || config.release_branch || config.target_branch || 'main';
    if (branch === 'refactor/code-organization') branch = 'main';

    // Nếu không truyền version, tự động tính toán patch version tiếp theo
    if (!version) {
      try {
        const headers = await this.getHeaders(config);
        const pkgRes = await fetch(`https://api.github.com/repos/${config.origin_repo}/contents/package.json?ref=${branch}`, { headers });
        if (pkgRes.ok) {
          const pkgData = await pkgRes.json();
          const pkgContent = JSON.parse(Buffer.from(pkgData.content, 'base64').toString('utf8'));
          const currentVer = pkgContent.version || '0.1.10';
          const parts = currentVer.split('.').map(Number);
          if (parts.length === 3 && !isNaN(parts[2])) {
            parts[2] += 1;
            version = parts.join('.');
          } else {
            version = `${currentVer}.1`;
          }
        }
      } catch (e) {
        version = '0.1.11';
      }
    }

    if (!version) version = '0.1.11';

    // Tạo release draft và kích hoạt build thông qua releaseService
    try {
      const release = await releaseService.createRelease({
        version,
        channel: data.channel || 'stable',
        changelog,
        is_current: false
      });

      const buildResult = await releaseService.startBuild(release.id);
      return {
        success: true,
        release_id: release.id,
        tag: buildResult.tag,
        commit_sha: buildResult.commit_sha,
        source_branch: buildResult.source_branch,
        message: `Đã tạo phiên bản v${version} trên nhánh ${buildResult.source_branch} và kích hoạt GitHub Actions build release thành công!`
      };
    } catch (err) {
      if (err.code === 'TAG_EXISTS' || err.statusCode === 409) {
        throw {
          statusCode: 400,
          code: 'RELEASE_ALREADY_EXISTS',
          message: `Phiên bản v${version} hoặc tag đã tồn tại trên GitHub. Vui lòng nhập phiên bản cao hơn (ví dụ: 0.1.12).`
        };
      }
      throw err;
    }
  }
}

module.exports = new UpstreamService();
