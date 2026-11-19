import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { TossDecision } from '../../../schemas/match.schema';

export class StartMatchDto {
  @ApiPropertyOptional({
    example: '672000000000000000000001',
    description: 'Player ID for batter on strike (from batting team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  strikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000002',
    description: 'Player ID for non-striker (from batting team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  nonStrikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000003',
    description: 'Player ID for opening bowler (from bowling team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  bowlerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000004',
    description: 'Designate user ID as the active match scorer',
  })
  @IsOptional()
  @IsMongoId()
  scorerUserId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000010',
    description: 'Optional toss winner Team ID if not recorded prior to match start',
  })
  @IsOptional()
  @IsMongoId()
  wonByTeamId?: string;

  @ApiPropertyOptional({
    enum: TossDecision,
    example: TossDecision.BAT,
    description: 'Optional toss decision if not recorded prior to match start',
  })
  @IsOptional()
  @IsEnum(TossDecision)
  decision?: TossDecision;
}
