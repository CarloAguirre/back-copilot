import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { WorkspaceTab } from './workspace-tab.entity';
import { WorkspaceSnapshot } from './workspace-snapshot.entity';
import { AgentAction } from './agent-action.entity';
import { AgentEvent } from './agent-event.entity';

@Entity('user_workspace_sessions')
export class UserWorkspaceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() githubUserId: string;
  @Column() username: string;
  @Column() repoFullName: string;
  @Column() owner: string;
  @Column() repo: string;
  @Column() branch: string;
  @Column({ nullable: true }) activePath: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;

  @OneToMany(() => WorkspaceTab, (t) => t.workspace, { cascade: true })
  tabs: WorkspaceTab[];

  @OneToMany(() => WorkspaceSnapshot, (s) => s.workspace, { cascade: true })
  snapshots: WorkspaceSnapshot[];

  @OneToMany(() => AgentAction, (a) => a.workspace, { cascade: true })
  actions: AgentAction[];

  @OneToMany(() => AgentEvent, (e) => e.workspace, { cascade: true })
  events: AgentEvent[];
}
