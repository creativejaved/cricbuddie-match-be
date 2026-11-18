import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BallEventDto } from './ball-event.dto';

export class SyncBallsDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Innings number for the deliveries',
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  inningsNumber: number;

  @ApiProperty({
    type: [BallEventDto],
    description: 'Batch of delivery events recorded offline or live',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BallEventDto)
  events: BallEventDto[];
}
