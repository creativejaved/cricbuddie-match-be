import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

export class StartNextInningsDto {
  @ApiPropertyOptional({
    example: '672000000000000000000001',
    description: 'Player ID for batter on strike (Innings 2 batting team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  strikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000002',
    description: 'Player ID for non-striker (Innings 2 batting team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  nonStrikerId?: string;

  @ApiPropertyOptional({
    example: '672000000000000000000003',
    description: 'Player ID for opening bowler (Innings 2 bowling team Playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  bowlerId?: string;
}
