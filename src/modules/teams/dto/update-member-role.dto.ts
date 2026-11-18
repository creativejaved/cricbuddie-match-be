import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { SquadRole } from '../../../schemas/team-member.schema';

export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: SquadRole,
    description:
      'Role to assign to member (ADMIN, CAPTAIN, VICE_CAPTAIN, PLAYER)',
    example: SquadRole.CAPTAIN,
  })
  @IsEnum(SquadRole)
  @IsNotEmpty()
  squadRole: SquadRole;
}
