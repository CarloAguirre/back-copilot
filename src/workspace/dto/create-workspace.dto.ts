import { IsString, IsNotEmpty } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString() @IsNotEmpty() repoFullName: string;
  @IsString() @IsNotEmpty() owner: string;
  @IsString() @IsNotEmpty() repo: string;
  @IsString() @IsNotEmpty() branch: string;
}
