import {
  Injectable, NotFoundException, ForbiddenException, HttpException, HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, concat, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { encryptToken } from '../common/crypto';
import { GithubService } from '../github/github.service';

import { UserWorkspaceSession } from './entities/user-workspace-session.entity';
import { WorkspaceTab } from './entities/workspace-tab.entity';
import { WorkspaceSnapshot } from './entities/workspace-snapshot.entity';
import { AgentAction, AgentActionStatus } from './entities/agent-action.entity';
import { AgentEvent, AgentEventType } from './entities/agent-event.entity';
import { EventBusService } from '../events/event-bus.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { PatchWorkspaceStateDto } from './dto/patch-workspace-state.dto';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(UserWorkspaceSession) private wsRepo: Repository<UserWorkspaceSession>,
    @InjectRepository(WorkspaceTab) private tabRepo: Repository<WorkspaceTab>,
    @InjectRepository(WorkspaceSnapshot) private snapRepo: Repository<WorkspaceSnapshot>,
    @InjectRepository(AgentAction) private actionRepo: Repository<AgentAction>,
    @InjectRepository(AgentEvent) private eventRepo: Repository<AgentEvent>,
    private readonly eventBus: EventBusService,
    private readonly githubService: GithubService,
    private readonly config: ConfigService,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(githubUserId: string, username: string, dto: CreateWorkspaceDto, accessToken: string) {
    console.log(`[workspace] create repoFullName=${dto.repoFullName} branch=${dto.branch}`);

    const encToken = encryptToken(accessToken, this.config.get<string>('JWT_SECRET'));
    const ws = this.wsRepo.create({ githubUserId, username, encryptedToken: encToken, ...dto });
    const saved = await this.wsRepo.save(ws);

    const backendUrl = this.config.get<string>('BACKEND_URL', '');
    const webhookSecret = this.config.get<string>('GITHUB_WEBHOOK_SECRET', '');

    if (!backendUrl || !webhookSecret) {
      console.warn(
        `[workspace] webhook skipped — BACKEND_URL=${backendUrl ? 'ok' : 'MISSING'} ` +
        `GITHUB_WEBHOOK_SECRET=${webhookSecret ? 'ok' : 'MISSING'}`,
      );
      return { workspaceId: saved.id };
    }

    const webhookUrl = `${backendUrl}/github/webhooks/agent-inbox`;
    console.log(`[workspace] attempting ensureWebhook ${dto.owner}/${dto.repo} → ${webhookUrl}`);

    // Best-effort — never fail workspace creation, but persist the outcome
    try {
      const result = await this.githubService.ensureWebhook(
        accessToken, dto.owner, dto.repo, webhookUrl, webhookSecret,
      );
      console.log(
        `[workspace] webhook ${result.alreadyExisted ? 'already existed' : 'created'} ` +
        `id=${result.hookId} url=${result.hookUrl}`,
      );
      await this.wsRepo.update(saved.id, {
        webhookInstalled: true,
        webhookHookId: result.hookId,
        webhookHookUrl: result.hookUrl,
        webhookLastError: null,
      });
    } catch (err) {
      const status: unknown = (err as any)?.status ?? (err as any)?.response?.status ?? 'unknown';
      const msg: string = (err as any)?.response?.data?.message ?? (err as any)?.message ?? 'unknown';
      console.error(`[workspace] ensureWebhook failed status=${status} message=${msg}`);
      await this.wsRepo.update(saved.id, {
        webhookInstalled: false,
        webhookLastError: `${status}: ${msg}`,
      });
    }

    return { workspaceId: saved.id };
  }

  // ── Webhook status ─────────────────────────────────────────────────────────

  async getWebhookStatus(workspaceId: string, userId: string) {
    const ws = await this.findOwnedOrFail(workspaceId, userId);
    return {
      repoFullName: ws.repoFullName,
      webhookInstalled: ws.webhookInstalled,
      hookId: ws.webhookHookId ?? null,
      hookUrl: ws.webhookHookUrl ?? null,
      lastError: ws.webhookLastError ?? null,
    };
  }

  // ── Patch state (idempotent) ───────────────────────────────────────────────

  async patchState(workspaceId: string, userId: string, dto: PatchWorkspaceStateDto) {
    const ws = await this.findOwnedOrFail(workspaceId, userId);

    if (dto.activePath !== undefined) {
      ws.activePath = dto.activePath;
      await this.wsRepo.save(ws);
    }

    if (dto.tabs?.length) {
      for (const tab of dto.tabs) {
        if (!tab.path) continue;

        // Validate content size before touching the DB
        if (tab.content !== undefined) {
          const bytes = Buffer.byteLength(tab.content, 'utf8');
          if (bytes > 200 * 1024) {
            throw new HttpException(
              { statusCode: 413, message: `Tab "${tab.path}" content exceeds 200 KB limit (${Math.ceil(bytes / 1024)} KB sent)`, error: 'Payload Too Large' },
              HttpStatus.PAYLOAD_TOO_LARGE,
            );
          }
        }

        // Find-then-merge: only overwrite columns that were actually sent.
        // Using upsert would null-out content on cursor-only updates.
        const existing = await this.tabRepo.findOne({ where: { workspaceId, path: tab.path } });

        if (existing) {
          if (tab.language  !== undefined) existing.language     = tab.language  ?? null;
          if (tab.sha       !== undefined) existing.sha          = tab.sha       ?? null;
          if (tab.dirty     !== undefined) existing.dirty        = tab.dirty     ?? false;
          if (tab.isActive  !== undefined) existing.isActive     = tab.isActive  ?? false;
          if (tab.content   !== undefined) existing.content      = tab.content;
          if (tab.cursor    !== undefined) {
            existing.cursorLine   = tab.cursor.line   ?? null;
            existing.cursorColumn = tab.cursor.column ?? null;
          }
          if (tab.selection !== undefined) {
            existing.selectionStart = (tab.selection.start ?? null) as any;
            existing.selectionEnd   = (tab.selection.end   ?? null) as any;
          }
          await this.tabRepo.save(existing);
        } else {
          await this.tabRepo.save(this.tabRepo.create({
            workspaceId,
            path:          tab.path,
            language:      tab.language  ?? null,
            sha:           tab.sha       ?? null,
            dirty:         tab.dirty     ?? false,
            isActive:      tab.isActive  ?? false,
            content:       tab.content   ?? null,
            cursorLine:    tab.cursor?.line   ?? null,
            cursorColumn:  tab.cursor?.column ?? null,
            selectionStart: (tab.selection?.start ?? null) as any,
            selectionEnd:   (tab.selection?.end   ?? null) as any,
          }));
        }
      }
    }

    // Persist snapshot
    await this.snapRepo.save(this.snapRepo.create({ workspaceId, payload: dto as any }));

    // Emit SSE
    const event = await this.eventRepo.save(
      this.eventRepo.create({
        workspaceId,
        type: AgentEventType.STATE_CHANGED,
        payload: { activePath: dto.activePath, tabCount: dto.tabs?.length ?? 0 },
      }),
    );
    this.eventBus.emit(workspaceId, { type: 'state_changed', event });
  }

  // ── Get state ─────────────────────────────────────────────────────────────

  async getState(workspaceId: string, userId: string) {
    const ws = await this.findOwnedOrFail(workspaceId, userId, ['tabs']);
    const pendingActions = await this.actionRepo.find({
      where: { workspaceId, status: AgentActionStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    return {
      workspace: {
        id: ws.id,
        repoFullName: ws.repoFullName,
        owner: ws.owner,
        repo: ws.repo,
        branch: ws.branch,
        activePath: ws.activePath,
        updatedAt: ws.updatedAt,
      },
      tabs: ws.tabs,
      pendingActions,
    };
  }

  // ── SSE event stream ──────────────────────────────────────────────────────

  async streamEvents(workspaceId: string, userId: string): Promise<Observable<Record<string, any>>> {
    await this.findOwnedOrFail(workspaceId, userId);

    const pending = await this.actionRepo.find({
      where: { workspaceId, status: AgentActionStatus.PENDING },
      order: { createdAt: 'ASC' },
    });

    const initialEvents = pending.map((action) => ({ type: 'agent_action', action }));

    return concat(
      from(initialEvents),
      this.eventBus.stream(workspaceId),
    );
  }

  // ── Apply / Reject actions ────────────────────────────────────────────────

  async applyAction(workspaceId: string, actionId: string, userId: string) {
    await this.findOwnedOrFail(workspaceId, userId);
    const action = await this.findActionOrFail(actionId, workspaceId);
    action.status = AgentActionStatus.APPLIED;
    action.appliedAt = new Date();
    await this.actionRepo.save(action);

    const event = await this.eventRepo.save(
      this.eventRepo.create({
        workspaceId,
        type: AgentEventType.ACTION_APPLIED,
        payload: { actionId },
      }),
    );
    this.eventBus.emit(workspaceId, { type: 'action_applied', event, actionId });
    return action;
  }

  async rejectAction(workspaceId: string, actionId: string, userId: string) {
    await this.findOwnedOrFail(workspaceId, userId);
    const action = await this.findActionOrFail(actionId, workspaceId);
    action.status = AgentActionStatus.REJECTED;
    await this.actionRepo.save(action);
    return action;
  }

  // ── Agent link (signed short-lived URL) ──────────────────────────────────

  async generateAgentLink(workspaceId: string, userId: string) {
    await this.findOwnedOrFail(workspaceId, userId);
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min
    const secret = this.config.get<string>('JWT_SECRET');
    const msg = `${workspaceId}:${expiresAt}`;
    const sig = createHmac('sha256', secret).update(msg).digest('hex');
    const token = `${workspaceId}.${expiresAt}.${sig}`;
    const backendUrl = this.config.get<string>('BACKEND_URL', '');
    const liveContextUrl = `${backendUrl}/agent/workspaces/${workspaceId}/live-context?token=${token}`;
    const liveSimpleUrl = `${backendUrl}/agent/live/${token}`;
    return { liveContextUrl, liveSimpleUrl, expiresAt: new Date(expiresAt).toISOString() };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async findByIdOrFail(workspaceId: string): Promise<UserWorkspaceSession> {
    const ws = await this.wsRepo.findOne({ where: { id: workspaceId }, relations: ['tabs'] });
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    return ws;
  }

  private async findOwnedOrFail(
    workspaceId: string,
    userId: string,
    relations: string[] = [],
  ): Promise<UserWorkspaceSession> {
    const ws = await this.wsRepo.findOne({ where: { id: workspaceId }, relations });
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`);
    if (ws.githubUserId !== userId) throw new ForbiddenException();
    return ws;
  }

  private async findActionOrFail(actionId: string, workspaceId: string): Promise<AgentAction> {
    const action = await this.actionRepo.findOne({ where: { id: actionId, workspaceId } });
    if (!action) throw new NotFoundException(`Action ${actionId} not found`);
    return action;
  }
}
