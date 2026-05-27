import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { AgentActionType } from '../../workspace/entities/agent-action.entity';

export class CreateActionDto {
  @IsEnum(AgentActionType)
  type: AgentActionType;

  @IsObject()
  payload: Record<string, any>;

  @IsString()
  @IsNotEmpty()
  createdBy: string;
}
