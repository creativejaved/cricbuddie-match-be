import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MembershipStatus } from '../../../schemas/team-member.schema';

export enum QueryRosterStatus {
  ACTIVE = MembershipStatus.ACTIVE,
  PENDING_PLAYER = MembershipStatus.PENDING_PLAYER,
  PENDING_ADMIN = MembershipStatus.PENDING_ADMIN,
}

export class QueryTeamMembersDto {
  @ApiPropertyOptional({
    enum: QueryRosterStatus,
    default: QueryRosterStatus.ACTIVE,
    description: 'Filter squad members by membership status',
  })
  @IsOptional()
  @IsEnum(QueryRosterStatus)
  status?: QueryRosterStatus = QueryRosterStatus.ACTIVE;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Page number for pagination',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Number of items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
