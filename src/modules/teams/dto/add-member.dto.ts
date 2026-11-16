import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { SquadRole } from '../../../schemas/team-member.schema';

export class AddMemberDto {
  @ApiProperty({
    description: 'MongoDB ObjectId of the user to recruit/invite to the squad',
    example: '672000000000000000000001',
  })
  @IsMongoId()
  @IsNotEmpty()
  targetUserId: string;

  @ApiPropertyOptional({
    enum: SquadRole,
    default: SquadRole.PLAYER,
    description: 'Squad role to assign upon joining',
  })
  @IsOptional()
  @IsEnum(SquadRole)
  squadRole?: SquadRole;
}
