import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class SetPlayingXIDto {
  @ApiProperty({
    enum: ['teamA', 'teamB'],
    example: 'teamA',
    description: 'Which team slot to update',
  })
  @IsIn(['teamA', 'teamB'])
  @IsNotEmpty()
  teamSlot: 'teamA' | 'teamB';

  @ApiProperty({
    type: [String],
    description:
      'Array of user IDs to include in the Playing XI (up to 11 players)',
    example: ['672000000000000000000001', '672000000000000000000002'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(11)
  @IsMongoId({ each: true })
  playerUserIds: string[];

  @ApiPropertyOptional({ description: 'Designated captain User ID' })
  @IsOptional()
  @IsMongoId()
  captainId?: string;

  @ApiPropertyOptional({ description: 'Designated wicket keeper User ID' })
  @IsOptional()
  @IsMongoId()
  wicketKeeperId?: string;
}
