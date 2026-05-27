import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePrDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  /** Source branch (on the user's fork or the repo itself). */
  @IsString()
  @IsNotEmpty()
  head: string;

  /** Target branch on the upstream repo (usually "main" or "master"). */
  @IsString()
  @IsNotEmpty()
  base: string;

  /**
   * Owner of the fork whose branch should be used as the PR head.
   * Required when opening a cross-repo (fork → upstream) PR.
   * If omitted the service uses the authenticated user's login.
   */
  @IsOptional()
  @IsString()
  headOwner?: string;
}
