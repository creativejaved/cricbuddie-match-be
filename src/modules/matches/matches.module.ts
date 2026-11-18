import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Match, MatchSchema } from '../../schemas/match.schema';
import { Inning, InningSchema } from '../../schemas/inning.schema';
import { Ball, BallSchema } from '../../schemas/ball.schema';
import { Team, TeamSchema } from '../../schemas/team.schema';
import { TeamMember, TeamMemberSchema } from '../../schemas/team-member.schema';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Match.name, schema: MatchSchema },
      { name: Inning.name, schema: InningSchema },
      { name: Ball.name, schema: BallSchema },
      { name: Team.name, schema: TeamSchema },
      { name: TeamMember.name, schema: TeamMemberSchema },
    ]),
  ],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
