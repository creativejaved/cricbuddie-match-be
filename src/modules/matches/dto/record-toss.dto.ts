import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty } from 'class-validator';
import { TossDecision } from '../../../schemas/match.schema';

export class RecordTossDto {
  @ApiProperty({
    example: '672000000000000000000010',
    description: 'Team ID that won the toss',
  })
  @IsMongoId()
  @IsNotEmpty()
  wonByTeamId: string;

  @ApiProperty({
    enum: TossDecision,
    example: TossDecision.BAT,
    description: 'Decision made by toss winner',
  })
  @IsEnum(TossDecision)
  @IsNotEmpty()
  decision: TossDecision;
}
