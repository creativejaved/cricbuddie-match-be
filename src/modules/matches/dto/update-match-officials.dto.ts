import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsMongoId, IsOptional } from 'class-validator';

export class UpdateMatchOfficialsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Assigned Scorer User IDs (max 2)',
    example: ['672000000000000000000002'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsMongoId({ each: true })
  scorerIds?: string[];

  @ApiPropertyOptional({
    description: 'Deprecated alias: Single Scorer User ID',
    example: '672000000000000000000002',
  })
  @IsOptional()
  @IsMongoId()
  scorerId?: string;

  @ApiPropertyOptional({
    description: 'Active scorer User ID currently recording balls',
    example: '672000000000000000000002',
  })
  @IsOptional()
  @IsMongoId()
  activeScorerId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Umpire User IDs (max 4)',
    example: ['672000000000000000000021', '672000000000000000000022'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsMongoId({ each: true })
  umpireIds?: string[];

  @ApiPropertyOptional({
    description: 'Match Referee User ID',
    example: '672000000000000000000025',
  })
  @IsOptional()
  @IsMongoId()
  matchRefereeId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Live Streamer User IDs (max 2)',
    example: ['672000000000000000000031'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsMongoId({ each: true })
  liveStreamerIds?: string[];

  @ApiPropertyOptional({
    description: 'Deprecated alias: Single Live Streamer User ID',
    example: '672000000000000000000031',
  })
  @IsOptional()
  @IsMongoId()
  streamerId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Commentator User IDs (max 2)',
    example: ['672000000000000000000041'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsMongoId({ each: true })
  commentatorIds?: string[];
}
