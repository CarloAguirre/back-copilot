import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AgentSession } from './agent-session.entity';
import { WorkspaceService } from '../workspace/workspace.service';

@Injectable()
export class AgentSessionService {
  constructor(
    @InjectRepository(AgentSession) private sessionRepo: Repository<AgentSession>,
    private readonly workspaceService: WorkspaceService,
    private readonly config: ConfigService,
  ) {}

  // ── PATCH /agent-session/active ───────────────────────────────────────────

  async setActive(userId: string, workspaceId: string) {
    // Verify ownership and get workspace metadata
    const ws = await this.workspaceService.findByIdOrFail(workspaceId);
    if (ws.githubUserId !== userId) throw new UnauthorizedException('Workspace belongs to a different user');

    // Generate short-lived link (for liveSimpleUrl column, informational)
    const linkResult = await this.workspaceService.generateAgentLink(workspaceId, userId);

    // Upsert session — find by userId, update or create
    let session = await this.sessionRepo.findOne({ where: { userId } });
    const isNew = !session;

    if (isNew) {
      session = this.sessionRepo.create({
        userId,
        agentKey: randomBytes(32).toString('hex'),
      });
    }

    session.activeWorkspaceId = workspaceId;
    session.activeRepo = ws.repoFullName;
    session.liveSimpleUrl = linkResult.liveSimpleUrl;
    await this.sessionRepo.save(session);

    const backendUrl = this.config.get<string>('BACKEND_URL', '');
    const agentCurrentUrl = `${backendUrl}/agent/current?key=${session.agentKey}`;

    return {
      agentKey: session.agentKey,
      agentCurrentUrl,
      activeWorkspaceId: workspaceId,
      activeRepo: ws.repoFullName,
      liveSimpleUrl: linkResult.liveSimpleUrl,
      expiresAt: linkResult.expiresAt,
    };
  }

  // ── GET /agent/current?key= ───────────────────────────────────────────────

  async getCurrent(agentKey: string) {
    const session = await this.sessionRepo.findOne({ where: { agentKey } });
    if (!session) throw new UnauthorizedException('Invalid agent key');
    if (!session.activeWorkspaceId) throw new NotFoundException('No active workspace set');

    const ws = await this.workspaceService.findByIdOrFail(session.activeWorkspaceId);
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
}
