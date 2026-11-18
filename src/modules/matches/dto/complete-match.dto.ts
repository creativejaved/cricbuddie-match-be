import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CompleteMatchDto {
  @ApiPropertyOptional({
    description: 'Winner Team ID (omit if tie or no result)',
  })
  @IsOptional()
  @IsMongoId()
  winnerTeamId?: string;

  @ApiPropertyOptional({
    description: 'Whether the match concluded in a tie',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isTie?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the match concluded with no result / abandoned',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isNoResult?: boolean;

  @ApiPropertyOptional({
    example: 'Royal Challengers won by 14 runs',
    description: 'Match victory margin description',
  })
  @IsOptional()
  @IsString()
  marginText?: string;

  @ApiPropertyOptional({ description: 'Player of the Match User ID' })
  @IsOptional()
  @IsMongoId()
  playerOfMatchId?: string;
}
