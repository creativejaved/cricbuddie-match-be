import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class AssignScorerDto {
  @ApiProperty({
    example: '672000000000000000000001',
    description: 'User ID of the designated active scorer',
  })
  @IsMongoId()
  @IsNotEmpty()
  scorerUserId: string;
}
