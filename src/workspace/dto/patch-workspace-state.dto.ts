import {
  IsString, IsBoolean, IsNumber, IsOptional,
  IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CursorDto {
  @IsNumber() @IsOptional() line?: number;
  @IsNumber() @IsOptional() column?: number;
}

class SelectionPointDto {
  @IsNumber() lineNumber: number;
  @IsNumber() column: number;
}

class SelectionDto {
  @IsOptional() @ValidateNested() @Type(() => SelectionPointDto) start?: SelectionPointDto;
  @IsOptional() @ValidateNested() @Type(() => SelectionPointDto) end?: SelectionPointDto;
}

export class PatchTabDto {
  @IsString() @IsOptional() path?: string;
  @IsString() @IsOptional() language?: string;
  @IsString() @IsOptional() sha?: string;
  @IsBoolean() @IsOptional() dirty?: boolean;
  @IsString() @IsOptional() content?: string;
  @IsOptional() @ValidateNested() @Type(() => CursorDto) cursor?: CursorDto;
  @IsOptional() @ValidateNested() @Type(() => SelectionDto) selection?: SelectionDto;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class PatchWorkspaceStateDto {
  @IsString() @IsOptional() activePath?: string;

  @IsArray() @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PatchTabDto)
  tabs?: PatchTabDto[];
}
