import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { decryptToken } from '../common/crypto';
import { GithubService } from '../github/github.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { EventBusService } from '../events/event-bus.service';
import { AgentAction, AgentActionStatus, AgentActionType } from '../workspace/entities/agent-action.entity';
import { AgentEvent, AgentEventType } from '../workspace/entities/agent-event.entity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INBOX_RE = /^\.nebula\/inbox\/([^/]+)\/([^/]+)\.json$/;

@Injectable()
export class WebhookService {
  constructor(
    @InjectRepository(AgentAction) private actionRepo: Repository<AgentAction>,
    @InjectRepository(AgentEvent) private eventRepo: Repository<AgentEvent>,
    private readonly githubService: GithubService,
    private readonly workspaceService: WorkspaceService,
    private readonly eventBus: EventBusService,
    private readonly config: ConfigService,
  ) {}

  verifySignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET', '');
    if (!secret) return false;
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  async handlePush(body: any): Promise<void> {
    const ref: string = body.ref ?? '';
    const branch = ref.replace('refs/heads/', '');
    const owner: string = body.repository?.owner?.login;
    const repo: string = body.repository?.name;

    if (!owner || !repo || !branch) return;

    const changed = new Set<string>();
    for (const commit of body.commits ?? []) {
      for (const f of [...(commit.added ?? []), ...(commit.modified ?? [])]) {
        changed.add(f as string);
      }
    }

    for (const filePath of changed) {
      const match = filePath.match(INBOX_RE);
      if (!match) continue;

      const [, workspaceId, actionId] = match;
      if (!UUID_RE.test(workspaceId) || !UUID_RE.test(actionId)) continue;

      try {
        await this.processInboxFile(workspaceId, actionId, filePath, branch, owner, repo);
      } catch (err) {
        console.error(`[webhook] Error processing ${filePath}:`, err?.message);
      }
    }
  }

  private async processInboxFile(
    workspaceId: string,
    actionId: string,
    filePath: string,
    branch: string,
    owner: string,
    repo: string,
  ): Promise<void> {
    // Idempotency check
    const existing = await this.actionRepo.findOne({ where: { id: actionId } });
    if (existing) return;

    // Resolve token
    const ws = await this.workspaceService.findByIdOrFail(workspaceId);
    if (!ws.encryptedToken) {
      console.warn(`[webhook] Workspace ${workspaceId} has no stored token`);
      return;
    }
    const token = decryptToken(ws.encryptedToken, this.config.get<string>('JWT_SECRET'));

    // Fetch and parse the inbox file
    const rawContent = await this.githubService.getFileRaw(token, owner, repo, filePath, branch);
    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error(`[webhook] Invalid JSON in ${filePath}`);
      return;
    }

    if (!parsed.type || !parsed.payload) {
      console.error(`[webhook] Missing type/payload in ${filePath}`);
      return;
    }

    const validTypes = Object.values(AgentActionType) as string[];
    if (!validTypes.includes(parsed.type)) {
      console.error(`[webhook] Unknown action type "${parsed.type}" in ${filePath}`);
      return;
    }

    // Persist action with filename-derived UUID for idempotency
    const action = await this.actionRepo.save(
      this.actionRepo.create({
        id: actionId,
        workspaceId,
        type: parsed.type as AgentActionType,
        payload: parsed.payload,
        createdBy: parsed.createdBy ?? 'chatgpt',
        status: AgentActionStatus.PENDING,
      }),
    );

    await this.eventRepo.save(
      this.eventRepo.create({
        workspaceId,
        type: AgentEventType.AGENT_ACTION,
        payload: { action },
      }),
    );

    this.eventBus.emit(workspaceId, { type: 'agent_action', action });
    console.log(`[webhook] Action ${actionId} created for workspace ${workspaceId}`);
  }
}
