import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TeamJoinPolicy } from '../../../schemas/team.schema';

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Royal Challengers Bangalore' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: 'RCBV' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(5)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'shortName must contain only alphanumeric characters',
  })
  shortName?: string;

  @ApiPropertyOptional({ example: 'Bengaluru' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.cricbuddie.com/logos/rcb-new.png',
  })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ enum: TeamJoinPolicy })
  @IsOptional()
  @IsEnum(TeamJoinPolicy)
  joinPolicy?: TeamJoinPolicy;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isInviteActive?: boolean;

  @ApiPropertyOptional({
    description: 'User ID of the squad member to designate as Captain',
  })
  @IsOptional()
  @IsMongoId()
  captainUserId?: string;

  @ApiPropertyOptional({
    description: 'User ID of the squad member to designate as Vice-Captain',
  })
  @IsOptional()
  @IsMongoId()
  viceCaptainUserId?: string;

  @ApiPropertyOptional({
    description: 'Array of user IDs to grant Admin privileges to',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  addAdminUserIds?: string[];

  @ApiPropertyOptional({
    description: 'Array of user IDs to revoke Admin privileges from',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  removeAdminUserIds?: string[];
}
