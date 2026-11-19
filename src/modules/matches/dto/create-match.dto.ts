import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BallType, MatchType, PitchType } from '../../../schemas/match.schema';

export class MatchVenueDto {
  @ApiProperty({
    example: 'M. Chinnaswamy Stadium',
    description: 'Name of the cricket ground',
  })
  @IsString()
  @IsNotEmpty()
  ground: string;

  @ApiPropertyOptional({
    example: 'M. Chinnaswamy Stadium',
    description: 'Deprecated alias for ground',
  })
  @IsOptional()
  @IsString()
  groundName?: string;

  @ApiProperty({
    example: 'Bengaluru',
    description: 'City where ground is located',
  })
  @IsString()
  @IsNotEmpty()
  city: string;
}

export class MatchOfficialsDto {
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
    description: 'Active scorer User ID currently recording balls',
  })
  @IsOptional()
  @IsMongoId()
  activeScorerId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Umpire User IDs (max 4)',
    example: ['672000000000000000000021'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsMongoId({ each: true })
  umpireIds?: string[];

  @ApiPropertyOptional({
    description: 'Match Referee User ID',
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

export class CreateMatchDto {
  @ApiProperty({
    example: '672000000000000000000010',
    description: 'Team A MongoDB ObjectId',
  })
  @IsMongoId()
  @IsNotEmpty()
  teamAId: string;

  @ApiProperty({
    example: '672000000000000000000011',
    description: 'Team B MongoDB ObjectId',
  })
  @IsMongoId()
  @IsNotEmpty()
  teamBId: string;

  @ApiPropertyOptional({
    enum: MatchType,
    example: MatchType.LIMITED_OVERS,
    default: MatchType.LIMITED_OVERS,
  })
  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType;

  @ApiPropertyOptional({
    enum: MatchType,
    example: MatchType.LIMITED_OVERS,
    description: 'Deprecated alias for matchType',
  })
  @IsOptional()
  @IsEnum(MatchType)
  matchFormat?: MatchType;

  @ApiPropertyOptional({
    example: 6,
    default: 6,
    description: 'Balls per over (automatically 5 for THE_HUNDRED)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  ballsPerOver?: number;

  @ApiPropertyOptional({
    enum: PitchType,
    example: PitchType.TURF,
    default: PitchType.TURF,
  })
  @IsOptional()
  @IsEnum(PitchType)
  pitchType?: PitchType;

  @ApiProperty({
    example: 20,
    minimum: 1,
    description: 'Number of overs per innings',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  oversPerInnings: number;

  @ApiPropertyOptional({ enum: BallType, default: BallType.LEATHER })
  @IsOptional()
  @IsEnum(BallType)
  ballType?: BallType;

  @ApiProperty({ type: MatchVenueDto })
  @ValidateNested()
  @IsNotEmptyObject()
  @Type(() => MatchVenueDto)
  venue: MatchVenueDto;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'If true, starts the match immediately (defaults scheduledAt to now)',
  })
  @IsOptional()
  @IsBoolean()
  startNow?: boolean;

  @ApiPropertyOptional({
    example: '2026-11-20T10:00:00.000Z',
    description:
      'Scheduled match kickoff time (defaults to current time if omitted or startNow is true)',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    type: MatchOfficialsDto,
    description: 'Match officials configuration with strict array limits',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MatchOfficialsDto)
  officials?: MatchOfficialsDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional scorer User IDs (max 2)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsMongoId({ each: true })
  scorerIds?: string[];

  @ApiPropertyOptional({
    description: 'Deprecated alias: Assigned scorer User ID',
  })
  @IsOptional()
  @IsMongoId()
  scorerId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional Umpire User IDs (max 4)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsMongoId({ each: true })
  umpireIds?: string[];

  @ApiPropertyOptional({
    description: 'Optional Match Referee User ID',
  })
  @IsOptional()
  @IsMongoId()
  matchRefereeId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional live streamer User IDs (max 2)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsMongoId({ each: true })
  liveStreamerIds?: string[];

  @ApiPropertyOptional({ description: 'Deprecated alias: live streamer User ID' })
  @IsOptional()
  @IsMongoId()
  streamerId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional Commentator User IDs (max 2)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsMongoId({ each: true })
  commentatorIds?: string[];

  @ApiPropertyOptional({ description: 'Optional Tournament ID' })
  @IsOptional()
  @IsMongoId()
  tournamentId?: string;
}
