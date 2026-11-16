import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum InvitationAction {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class RespondInvitationDto {
  @ApiProperty({
    enum: InvitationAction,
    example: InvitationAction.ACCEPT,
    description: 'Accept or reject the team invitation',
  })
  @IsEnum(InvitationAction)
  @IsNotEmpty()
  action: InvitationAction;
}
