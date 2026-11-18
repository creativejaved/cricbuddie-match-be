import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { QueryMatchesDto } from './dto/query-matches.dto';
import { SetPlayingXIDto } from './dto/set-playing-xi.dto';
import { RecordTossDto } from './dto/record-toss.dto';
import { CompleteMatchDto } from './dto/complete-match.dto';
import { UpdateMatchOfficialsDto } from './dto/update-match-officials.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ObjectIdValidationPipe } from '../../common/pipes/object-id-validation.pipe';

@ApiTags('Matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  /**
   * 1. Schedule a new cricket match
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Schedule a new cricket match' })
  @ApiResponse({ status: 201, description: 'Match created successfully' })
  createMatch(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateMatchDto,
  ) {
    return this.matchesService.createMatch(userId, dto);
  }

  /**
   * 2. Paginated list of matches filtered by status, city, team, or personal participation
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get paginated list of matches with filters (status, city, team, myMatches)',
  })
  getMatches(
    @Query() query: QueryMatchesDto,
    @CurrentUser('userId') currentUserId?: string,
  ) {
    return this.matchesService.getMatches(query, currentUserId);
  }

  /**
   * 3. Get match details with innings scorecards and live delivery timeline
   */
  @Get(':matchId')
  @ApiOperation({
    summary:
      'Get complete match details, inning scorecards, and recent ball timeline',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  getMatchById(@Param('matchId', ObjectIdValidationPipe) matchId: string) {
    return this.matchesService.getMatchById(matchId);
  }

  /**
   * 4. Set Playing XI for Team A or Team B
   */
  @Patch(':matchId/playing-xi')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Set Playing XI squad members, captain, and wicket keeper for Team A or B',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  setPlayingXI(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: SetPlayingXIDto,
  ) {
    return this.matchesService.setPlayingXI(matchId, userId, dto);
  }

  /**
   * 5. Record Toss and transition match to LIVE
   */
  @Patch(':matchId/toss')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Record match toss, determine batting order, and initialize Innings 1',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  recordToss(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: RecordTossDto,
  ) {
    return this.matchesService.recordToss(matchId, userId, dto);
  }

  /**
   * 6. Transition to Next Innings (Innings 1 -> Innings 2)
   */
  @Post(':matchId/innings/next')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Complete Innings 1, set target runs, and initialize Innings 2',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  nextInnings(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.matchesService.nextInnings(matchId, userId);
  }

  /**
   * 7. Finalize match, record result, and update team stats
   */
  @Patch(':matchId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Finalize match, record winner/margin, and atomically update team stats',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  completeMatch(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CompleteMatchDto,
  ) {
    return this.matchesService.completeMatch(matchId, userId, dto);
  }

  /**
   * 8. Update match officials (scorers, umpires, streamers, commentators)
   */
  @Patch(':matchId/officials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Update match officials (scorers, umpires, streamers, commentators)',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  updateOfficials(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateMatchOfficialsDto,
  ) {
    return this.matchesService.updateOfficials(matchId, userId, dto);
  }
}
