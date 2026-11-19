import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { TossDecision } from '../../../schemas/match.schema';

export class RecordTossDto {
  @ApiProperty({
    example: '672000000000000000000010',
    description: 'Team ID that won the toss',
  })
  @IsMongoId()
  @IsNotEmpty()
  wonByTeamId: string;

  @ApiProperty({
    enum: TossDecision,
    example: TossDecision.BAT,
    description: 'Decision made by toss winner',
  })
  @IsEnum(TossDecision)
  @IsNotEmpty()
  decision: TossDecision;

  @ApiPropertyOptional({
    example: '672000000000000000000001',
    description: 'Optional player ID for batter on strike (batting team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  strikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000002',
    description: 'Optional player ID for non-striker (batting team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  nonStrikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000003',
    description: 'Optional player ID for opening bowler (bowling team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  bowlerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000004',
    description: 'Optional user ID to designate as the active match scorer',
  })
  @IsOptional()
  @IsMongoId()
  scorerUserId?: string;
}
