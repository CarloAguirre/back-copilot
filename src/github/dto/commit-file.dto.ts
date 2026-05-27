import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CommitFileDto {
  @IsString()
  @IsNotEmpty()
  path: string;

  /** Raw UTF-8 content. The service base64-encodes it before calling GitHub. */
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  branch: string;

  /**
   * Existing file blob SHA – required by GitHub when updating a file.
   * If omitted the service will fetch it automatically.
   */
  @IsOptional()
  @IsString()
  sha?: string;
}
