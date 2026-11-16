import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum RequestAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class RespondRequestDto {
  @ApiProperty({
    enum: RequestAction,
    example: RequestAction.APPROVE,
    description: 'Approve or reject the join request',
  })
  @IsEnum(RequestAction)
  @IsNotEmpty()
  action: RequestAction;
}
