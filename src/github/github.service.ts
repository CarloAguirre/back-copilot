import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { CommitFileDto } from './dto/commit-file.dto';
import { CreatePrDto } from './dto/create-pr.dto';

@Injectable()
export class GithubService {
  private octokit(token: string): Octokit {
    return new Octokit({ auth: token });
  }

  // ─── User ─────────────────────────────────────────────────────────────────

  async listRepos(token: string) {
    const kit = this.octokit(token);
    const { data } = await kit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      affiliation: 'owner,collaborator,organization_member',
    });
    return data.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      owner: r.owner.login,
      name: r.name,
      private: r.private,
      defaultBranch: r.default_branch,
      description: r.description,
      pushedAt: r.pushed_at,
      htmlUrl: r.html_url,
      permissions: r.permissions,
    }));
  }

  // ─── File tree ─────────────────────────────────────────────────────────────

  async getTree(token: string, owner: string, repo: string, branch?: string) {
    const kit = this.octokit(token);

    // Resolve the branch (fall back to the repo default).
    const ref = branch || (await this.defaultBranch(kit, owner, repo));

    let commitSha: string;
    try {
      const { data: refData } = await kit.git.getRef({
        owner,
        repo,
        ref: `heads/${ref}`,
      });
      commitSha = refData.object.sha;
    } catch {
      throw new NotFoundException(`Branch "${ref}" not found in ${owner}/${repo}`);
    }

    const { data: commitData } = await kit.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });

    const { data: treeData } = await kit.git.getTree({
      owner,
      repo,
      tree_sha: commitData.tree.sha,
      recursive: '1',
    });

    return {
      branch: ref,
      truncated: treeData.truncated,
      tree: treeData.tree.map((item) => ({
        path: item.path,
        type: item.type, // "blob" | "tree"
        sha: item.sha,
        size: item.size,
      })),
    };
  }

  // ─── File content ──────────────────────────────────────────────────────────

  async getFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    branch?: string,
  ) {
    const kit = this.octokit(token);
    try {
      const { data } = await kit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });

      if (Array.isArray(data)) {
        throw new BadRequestException(`"${path}" is a directory, not a file`);
      }

      if (data.type !== 'file') {
        throw new BadRequestException(`"${path}" is not a file`);
      }

      const content = Buffer.from(
        (data as any).content,
        'base64',
      ).toString('utf-8');

      return {
        path: data.path,
        sha: data.sha,
        size: data.size,
        content,
        encoding: 'utf-8',
        htmlUrl: data.html_url,
      };
    } catch (err) {
      if (err.status === 404) {
        throw new NotFoundException(`File "${path}" not found`);
      }
      throw err;
    }
  }

  // ─── Commit file ───────────────────────────────────────────────────────────

  /**
   * Commits a file to a repository.
   *
   * If the authenticated user does not have push access to owner/repo, the
   * service automatically works on the user's fork instead and returns the
   * fork details so the frontend can open a PR afterwards.
   */
  async commitFile(
    token: string,
    username: string,
    owner: string,
    repo: string,
    dto: CommitFileDto,
  ) {
    const kit = this.octokit(token);

    let targetOwner = owner;
    let targetRepo = repo;
    let usedFork = false;

    // ── Access check ────────────────────────────────────────────────────────
    const hasPush = await this.checkPushAccess(kit, owner, repo);

    if (!hasPush) {
      // Get or create a fork under the authenticated user's account.
      const fork = await this.ensureFork(kit, owner, repo);
      targetOwner = fork.owner.login;
      targetRepo = fork.name;
      usedFork = true;

      // Sync the fork's target branch with upstream before writing.
      await this.syncForkBranch(kit, targetOwner, targetRepo, dto.branch, owner, repo);
    }

    // ── Resolve existing file SHA (needed to update rather than create) ──────
    let existingSha = dto.sha;
    if (!existingSha) {
      try {
        const { data: existing } = await kit.repos.getContent({
          owner: targetOwner,
          repo: targetRepo,
          path: dto.path,
          ref: dto.branch,
        });
        if (!Array.isArray(existing) && 'sha' in existing) {
          existingSha = existing.sha;
        }
      } catch {
        // File doesn't exist yet – that's fine, we'll create it.
      }
    }

    const { data: result } = await kit.repos.createOrUpdateFileContents({
      owner: targetOwner,
      repo: targetRepo,
      path: dto.path,
      message: dto.message,
      content: Buffer.from(dto.content, 'utf-8').toString('base64'),
      sha: existingSha,
      branch: dto.branch,
    });

    return {
      usedFork,
      forkOwner: usedFork ? targetOwner : undefined,
      upstreamOwner: owner,
      upstreamRepo: repo,
      commit: {
        sha: result.commit.sha,
        message: result.commit.message,
        htmlUrl: result.commit.html_url,
      },
      file: {
        path: result.content?.path,
        sha: result.content?.sha,
        htmlUrl: result.content?.html_url,
      },
    };
  }

  // ─── Create PR ─────────────────────────────────────────────────────────────

  async createPr(
    token: string,
    username: string,
    owner: string,
    repo: string,
    dto: CreatePrDto,
  ) {
    const kit = this.octokit(token);

    // Cross-repo PR: "forkOwner:branch" → upstream owner/repo
    const headOwner = dto.headOwner || username;
    const headRef =
      headOwner !== owner ? `${headOwner}:${dto.head}` : dto.head;

    try {
      const { data } = await kit.pulls.create({
        owner,
        repo,
        title: dto.title,
        body: dto.body ?? '',
        head: headRef,
        base: dto.base,
      });

      return {
        number: data.number,
        title: data.title,
        state: data.state,
        htmlUrl: data.html_url,
        diffUrl: data.diff_url,
        head: data.head.label,
        base: data.base.label,
        createdAt: data.created_at,
      };
    } catch (err) {
      const msg: string = err.response?.data?.errors?.[0]?.message ?? err.message ?? '';
      if (msg.includes('A pull request already exists')) {
        throw new BadRequestException('A pull request for this branch already exists');
      }
      if (msg.includes('No commits between')) {
        throw new BadRequestException('No commits between head and base – nothing to PR');
      }
      throw new InternalServerErrorException(`GitHub API error: ${msg}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async defaultBranch(kit: Octokit, owner: string, repo: string) {
    const { data } = await kit.repos.get({ owner, repo });
    return data.default_branch;
  }

  private async checkPushAccess(kit: Octokit, owner: string, repo: string) {
    try {
      const { data } = await kit.repos.get({ owner, repo });
      return data.permissions?.push === true;
    } catch {
      return false;
    }
  }

  private async ensureFork(kit: Octokit, owner: string, repo: string) {
    // Check if the authenticated user already has a fork.
    try {
      const { data: authUser } = await kit.users.getAuthenticated();
      const { data: fork } = await kit.repos.get({
        owner: authUser.login,
        repo,
      });
      // Verify it is indeed a fork of the target repo.
      if (fork.fork && fork.parent?.full_name === `${owner}/${repo}`) {
        return fork;
      }
    } catch {
      // Fork does not exist yet – create it.
    }

    const { data: newFork } = await kit.repos.createFork({ owner, repo });

    // GitHub forks are async – poll until the fork is ready (max 30 s).
    await this.waitForFork(kit, newFork.owner.login, newFork.name);
    return newFork;
  }

  private async waitForFork(
    kit: Octokit,
    forkOwner: string,
    forkRepo: string,
    maxWaitMs = 30_000,
  ) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      try {
        await kit.repos.get({ owner: forkOwner, repo: forkRepo });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw new InternalServerErrorException('Timed out waiting for fork to be ready');
  }

  /**
   * Ensures the fork's branch exists and is up-to-date with the upstream.
   * Creates the branch if it doesn't exist (branching off the upstream default).
   */
  private async syncForkBranch(
    kit: Octokit,
    forkOwner: string,
    forkRepo: string,
    branch: string,
    upstreamOwner: string,
    upstreamRepo: string,
  ) {
    // Try to merge upstream into the fork's default branch first.
    try {
      await kit.repos.mergeUpstream({
        owner: forkOwner,
        repo: forkRepo,
        branch: await this.defaultBranch(kit, forkOwner, forkRepo),
      });
    } catch {
      // mergeUpstream may fail if already up-to-date – that's fine.
    }

    // Ensure the feature branch exists on the fork.
    try {
      await kit.repos.getBranch({ owner: forkOwner, repo: forkRepo, branch });
    } catch {
      // Branch missing – create it off the fork's default branch.
      const defaultBr = await this.defaultBranch(kit, forkOwner, forkRepo);
      const { data: ref } = await kit.git.getRef({
        owner: forkOwner,
        repo: forkRepo,
        ref: `heads/${defaultBr}`,
      });
      await kit.git.createRef({
        owner: forkOwner,
        repo: forkRepo,
        ref: `refs/heads/${branch}`,
        sha: ref.object.sha,
      });
    }
  }
}
