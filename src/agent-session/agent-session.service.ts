import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AgentSession } from './agent-session.entity';
import { WorkspaceService } from '../workspace/workspace.service';
import { UserWorkspaceSession } from '../workspace/entities/user-workspace-session.entity';
import { GithubService } from '../github/github.service';
import { decryptToken } from '../common/crypto';

@Injectable()
export class AgentSessionService {
  constructor(
    @InjectRepository(AgentSession) private sessionRepo: Repository<AgentSession>,
    private readonly workspaceService: WorkspaceService,
    private readonly githubService: GithubService,
    private readonly config: ConfigService,
  ) {}

  async setActive(userId: string, workspaceId: string, alias?: string) {
    const ws = await this.workspaceService.findByIdOrFail(workspaceId);
    if (ws.githubUserId !== userId) throw new UnauthorizedException('Workspace belongs to a different user');

    const linkResult = await this.workspaceService.generateAgentLink(workspaceId, userId);

    let session = await this.sessionRepo.findOne({ where: { userId } });
    if (!session) {
      session = this.sessionRepo.create({
        userId,
        agentKey: randomBytes(32).toString('hex'),
      });
    }

    session.activeWorkspaceId = workspaceId;
    session.activeRepo = ws.repoFullName;
    session.liveSimpleUrl = linkResult.liveSimpleUrl;

    const envAlias = this.config.get<string>('AGENT_ALIAS', '').trim();
    const finalAlias = alias?.trim() || envAlias || session.alias || null;
    if (finalAlias) session.alias = finalAlias;

    await this.sessionRepo.save(session);

    const backendUrl = this.config.get<string>('BACKEND_URL', '');
    const agentCurrentUrl = `${backendUrl}/agent/current?key=${session.agentKey}`;
    const agentAliasUrl = session.alias ? `${backendUrl}/agent/current/${session.alias}` : null;
    const context = this.formatContext(ws);

    await this.mirrorCurrentContext(session, ws, context).catch((err) => {
      console.warn(`[agent-session] github mirror failed: ${err?.message ?? err}`);
    });

    return {
      agentKey: session.agentKey,
      agentCurrentUrl,
      agentAliasUrl,
      activeWorkspaceId: workspaceId,
      activeRepo: ws.repoFullName,
      liveSimpleUrl: linkResult.liveSimpleUrl,
      mirrorRepo: this.controlRepo(ws),
      mirrorPath: this.controlPath(),
      expiresAt: linkResult.expiresAt,
    };
  }

  async getCurrent(agentKey: string) {
    const session = await this.sessionRepo.findOne({ where: { agentKey } });
    if (!session) throw new UnauthorizedException('Invalid agent key');
    return this.resolveContext(session);
  }

  async getCurrentByAlias(alias: string) {
    const session = await this.sessionRepo.findOne({ where: { alias } });
    if (!session) throw new NotFoundException(`No session found for alias "${alias}"`);
    return this.resolveContext(session);
  }

  private async resolveContext(session: AgentSession) {
    if (!session.activeWorkspaceId) throw new NotFoundException('No active workspace set');
    const ws = await this.workspaceService.findByIdOrFail(session.activeWorkspaceId);
    return this.formatContext(ws);
  }

  private formatContext(ws: UserWorkspaceSession) {
    const dirtyFiles = ws.tabs.filter((t) => t.dirty).map((t) => t.path);
    return {
      workspaceId: ws.id,
      repoFullName: ws.repoFullName,
      owner: ws.owner,
      repo: ws.repo,
      branch: ws.branch,
      activePath: ws.activePath,
      updatedAt: ws.updatedAt,
      tabs: ws.tabs.map((t) => ({
        path: t.path,
        language: t.language,
        sha: t.sha,
        dirty: t.dirty,
        isActive: t.isActive,
        content: t.content,
        cursorLine: t.cursorLine,
        cursorColumn: t.cursorColumn,
        selectionStart: t.selectionStart,
        selectionEnd: t.selectionEnd,
      })),
      dirtyFiles,
    };
  }

  private controlRepo(ws: UserWorkspaceSession) {
    return this.config.get<string>('NEBULA_CONTROL_REPO', '').trim() || `${ws.owner}/copilot-plus`;
  }

  private controlPath() {
    return this.config.get<string>('NEBULA_CONTEXT_PATH', '.nebula/current-context.json').trim();
  }

  private controlBranch() {
    return this.config.get<string>('NEBULA_CONTROL_BRANCH', 'main').trim();
  }

  private async mirrorCurrentContext(session: AgentSession, ws: UserWorkspaceSession, context: any) {
    if (!ws.encryptedToken) throw new Error('workspace has no encrypted token');

    const token = decryptToken(ws.encryptedToken, this.config.get<string>('JWT_SECRET'));
    const repoFullName = this.controlRepo(ws);
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) throw new Error(`invalid NEBULA_CONTROL_REPO: ${repoFullName}`);

    const mirrorPayload = {
      alias: session.alias,
      agentKey: session.agentKey,
      activeWorkspaceId: session.activeWorkspaceId,
      activeRepo: session.activeRepo,
      source: 'postgres-agent-session',
      mirroredAt: new Date().toISOString(),
      context: {
        workspaceId: context.workspaceId,
        repoFullName: context.repoFullName,
        owner: context.owner,
        repo: context.repo,
        branch: context.branch,
        activePath: context.activePath,
        updatedAt: context.updatedAt,
        dirtyFiles: context.dirtyFiles,
        tabs: context.tabs.map((tab) => ({
          path: tab.path,
          language: tab.language,
          sha: tab.sha,
          dirty: tab.dirty,
          isActive: tab.isActive,
          cursorLine: tab.cursorLine,
          cursorColumn: tab.cursorColumn,
          selectionStart: tab.selectionStart,
          selectionEnd: tab.selectionEnd,
        })),
      },
    };

    await this.githubService.commitFile(token, ws.username, owner, repo, {
      path: this.controlPath(),
      content: JSON.stringify(mirrorPayload, null, 2),
      message: `chore: update nebula current context (${session.alias ?? session.agentKey.slice(0, 8)})`,
      branch: this.controlBranch(),
    });
  }
}
