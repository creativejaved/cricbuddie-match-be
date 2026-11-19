import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

export class UpdateInningsStateDto {
  @ApiPropertyOptional({
    example: '672000000000000000000001',
    description: 'Player ID for batter currently on strike',
  })
  @IsOptional()
  @IsMongoId()
  strikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000002',
    description: 'Player ID for non-striking batter',
  })
  @IsOptional()
  @IsMongoId()
  nonStrikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000003',
    description: 'Player ID of current bowler',
  })
  @IsOptional()
  @IsMongoId()
  currentBowlerId?: string;
}
