import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { UserWorkspaceSession } from './user-workspace-session.entity';

export enum AgentActionStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

export enum AgentActionType {
  REPLACE_FILE = 'replace_file',
  PATCH_FILE = 'patch_file',
  OPEN_FILE = 'open_file',
  SHOW_MESSAGE = 'show_message',
  MULTI_FILE_PATCH = 'multi_file_patch',
}

@Entity('agent_actions')
export class AgentAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() workspaceId: string;

  @ManyToOne(() => UserWorkspaceSession, (ws) => ws.actions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: UserWorkspaceSession;

  @Column({ type: 'enum', enum: AgentActionStatus, default: AgentActionStatus.PENDING })
  status: AgentActionStatus;

  @Column({ type: 'enum', enum: AgentActionType })
  type: AgentActionType;

  @Column({ type: 'jsonb' }) payload: Record<string, any>;
  @Column() createdBy: string;

  @CreateDateColumn() createdAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  appliedAt: Date;
}
