import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn,
} from 'typeorm';

@Entity('agent_sessions')
export class AgentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string; // githubUserId — one row per user

  @Column({ nullable: true })
  activeWorkspaceId: string;

  @Column({ nullable: true })
  activeRepo: string; // repoFullName of the active workspace

  @Column({ type: 'text', nullable: true })
  liveSimpleUrl: string; // latest short-lived token URL (informational)

  @Column({ unique: true })
  agentKey: string; // stable key — given to ChatGPT once, never rotates

  @UpdateDateColumn()
  updatedAt: Date;
}
