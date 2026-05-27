import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { UserWorkspaceSession } from './user-workspace-session.entity';

export enum AgentEventType {
  STATE_CHANGED = 'state_changed',
  AGENT_ACTION = 'agent_action',
  ACTION_APPLIED = 'action_applied',
  ERROR = 'error',
}

@Entity('agent_events')
export class AgentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() workspaceId: string;

  @ManyToOne(() => UserWorkspaceSession, (ws) => ws.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: UserWorkspaceSession;

  @Column({ type: 'enum', enum: AgentEventType })
  type: AgentEventType;

  @Column({ type: 'jsonb' }) payload: Record<string, any>;

  @CreateDateColumn() createdAt: Date;
}
