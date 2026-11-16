import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TeamJoinPolicy } from '../../../schemas/team.schema';

export class CreateTeamDto {
  @ApiProperty({ example: 'Royal Challengers', description: 'Full team name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    example: 'RCB',
    description: 'Short abbreviation, 2 to 5 characters',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(5)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'shortName must contain only alphanumeric characters',
  })
  shortName: string;

  @ApiPropertyOptional({ example: 'Bengaluru', description: 'Team home city' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.cricbuddie.com/logos/rcb.png',
    description: 'Team logo URL',
  })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({
    enum: TeamJoinPolicy,
    default: TeamJoinPolicy.APPROVAL,
    description: 'Team join policy: OPEN, APPROVAL, or INVITE_ONLY',
  })
  @IsOptional()
  @IsEnum(TeamJoinPolicy)
  joinPolicy?: TeamJoinPolicy;
}
