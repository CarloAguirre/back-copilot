import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  UpdateDateColumn, JoinColumn, Unique,
} from 'typeorm';
import { UserWorkspaceSession } from './user-workspace-session.entity';

@Entity('workspace_tabs')
@Unique(['workspaceId', 'path'])
export class WorkspaceTab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() workspaceId: string;

  @ManyToOne(() => UserWorkspaceSession, (ws) => ws.tabs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: UserWorkspaceSession;

  @Column() path: string;
  @Column({ nullable: true }) language: string;
  @Column({ nullable: true }) sha: string;
  @Column({ default: false }) dirty: boolean;
  @Column({ type: 'text', nullable: true }) content: string;
  @Column({ nullable: true }) cursorLine: number;
  @Column({ nullable: true }) cursorColumn: number;
  @Column({ type: 'jsonb', nullable: true }) selectionStart: Record<string, number>;
  @Column({ type: 'jsonb', nullable: true }) selectionEnd: Record<string, number>;
  @Column({ default: false }) isActive: boolean;

  @UpdateDateColumn() updatedAt: Date;
}
