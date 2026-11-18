import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DismissalType, ExtraType } from '../../../schemas/ball.schema';

export class BallWicketDto {
  @ApiProperty({ default: false })
  @IsBoolean()
  isWicket: boolean;

  @ApiPropertyOptional({ enum: DismissalType })
  @IsOptional()
  @IsEnum(DismissalType)
  dismissalType?: DismissalType;

  @ApiPropertyOptional({ description: 'Dismissed player User ID' })
  @IsOptional()
  @IsMongoId()
  dismissedPlayerId?: string;

  @ApiPropertyOptional({
    description: 'Fielder User ID (if caught, run out, stumped)',
  })
  @IsOptional()
  @IsMongoId()
  fielderId?: string;
}

export class BallEventDto {
  @ApiProperty({
    example: 'd9b2d63d-a233-4123-8472-1329abc12345',
    description: 'Client-generated UUIDv4 for idempotent sync',
  })
  @IsString()
  @IsNotEmpty()
  clientEventId: string;

  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Monotonic sequence number within the innings',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sequenceNumber: number;

  @ApiProperty({ example: 1, minimum: 1, description: '1-indexed over number' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  overNumber: number;

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: 6,
    description: 'Legal delivery counter within current over (1..6)',
  })
  @IsInt()
  @Min(1)
  @Max(6)
  @Type(() => Number)
  legalBallInOver: number;

  @ApiProperty({ description: 'Bowler User ID' })
  @IsMongoId()
  @IsNotEmpty()
  bowlerId: string;

  @ApiProperty({ description: 'Striker User ID' })
  @IsMongoId()
  @IsNotEmpty()
  strikerId: string;

  @ApiProperty({ description: 'Non-striker User ID' })
  @IsMongoId()
  @IsNotEmpty()
  nonStrikerId: string;

  @ApiProperty({
    default: 0,
    minimum: 0,
    maximum: 7,
    description: 'Runs scored off the bat',
  })
  @IsInt()
  @Min(0)
  @Max(7)
  @Type(() => Number)
  runsOffBat: number;

  @ApiPropertyOptional({ enum: ExtraType, default: ExtraType.NONE })
  @IsOptional()
  @IsEnum(ExtraType)
  extraType?: ExtraType = ExtraType.NONE;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  extraRuns?: number = 0;

  @ApiProperty({
    description: 'False for WIDE, NO_BALL, PENALTY; true otherwise',
  })
  @IsBoolean()
  isLegalDelivery: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBoundaryFour?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBoundarySix?: boolean;

  @ApiPropertyOptional({ type: BallWicketDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BallWicketDto)
  wicket?: BallWicketDto;

  @ApiProperty({
    example: '2026-11-20T10:15:30.000Z',
    description: 'Device timestamp when delivery was recorded',
  })
  @IsDateString()
  @IsNotEmpty()
  recordedAt: string;
}
