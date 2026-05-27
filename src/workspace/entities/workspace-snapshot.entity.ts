import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { UserWorkspaceSession } from './user-workspace-session.entity';

@Entity('workspace_snapshots')
export class WorkspaceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() workspaceId: string;

  @ManyToOne(() => UserWorkspaceSession, (ws) => ws.snapshots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: UserWorkspaceSession;

  @Column({ type: 'jsonb' }) payload: Record<string, any>;

  @CreateDateColumn() createdAt: Date;
}
