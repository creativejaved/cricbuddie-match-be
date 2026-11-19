import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  MatchStatus,
  MatchType,
  PitchType,
} from '../../../schemas/match.schema';

export class QueryMatchesDto {
  @ApiPropertyOptional({
    enum: MatchStatus,
    description: 'Filter by match status',
  })
  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  @ApiPropertyOptional({
    enum: MatchType,
    description: 'Filter by match type (variation)',
  })
  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType;

  @ApiPropertyOptional({
    enum: PitchType,
    description: 'Filter by pitch surface type',
  })
  @IsOptional()
  @IsEnum(PitchType)
  pitchType?: PitchType;

  @ApiPropertyOptional({ description: 'Filter by venue city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by participating Team ID' })
  @IsOptional()
  @IsMongoId()
  teamId?: string;

  @ApiPropertyOptional({
    description:
      'Filter matches related to a specific User ID (creator, scorer, umpire, or playing XI)',
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Filter matches related to authenticated user (creator, scorer, or playing XI)',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  myMatches?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
