import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Match, MatchSchema } from '../../schemas/match.schema';
import { Inning, InningSchema } from '../../schemas/inning.schema';
import { Ball, BallSchema } from '../../schemas/ball.schema';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Match.name, schema: MatchSchema },
      { name: Inning.name, schema: InningSchema },
      { name: Ball.name, schema: BallSchema },
    ]),
  ],
  controllers: [ScoringController],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
