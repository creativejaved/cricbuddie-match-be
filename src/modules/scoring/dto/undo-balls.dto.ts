import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UndoBallsDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Innings number of ball(s) to undo',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  inningsNumber: number;

  @ApiPropertyOptional({
    description:
      'Specific sequence number down to which deliveries should be marked undone',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  upToSequence?: number;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description:
      'Number of recent deliveries to undo (defaults to 1 if upToSequence is not set)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  count?: number = 1;
}
