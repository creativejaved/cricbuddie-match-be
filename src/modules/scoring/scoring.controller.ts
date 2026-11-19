import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ScoringService } from './scoring.service';
import { SyncBallsDto } from './dto/sync-balls.dto';
import { UndoBallsDto } from './dto/undo-balls.dto';
import { UpdateInningsStateDto } from './dto/update-innings-state.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ObjectIdValidationPipe } from '../../common/pipes/object-id-validation.pipe';

@ApiTags('Scoring')
@Controller('matches')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  /**
   * 1. Idempotent batch sync for ball-by-ball deliveries (Offline-First)
   */
  @Post(':matchId/balls/sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Idempotently sync batch of deliveries recorded offline or live (Scorer only)',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  @ApiResponse({
    status: 200,
    description: 'Deliveries synced and scorecard deterministically updated',
  })
  syncBalls(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: SyncBallsDto,
  ) {
    return this.scoringService.syncBalls(matchId, userId, dto);
  }

  /**
   * 2. Reversible undo for deliveries
   */
  @Post(':matchId/balls/undo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Undo deliveries and deterministically recompute innings scorecard (Scorer only)',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  undoBalls(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UndoBallsDto,
  ) {
    return this.scoringService.undoBalls(matchId, userId, dto);
  }

  /**
   * 3. Get deliveries grouped by over for commentary and timeline views
   */
  @Get(':matchId/innings/:inningsNumber/balls')
  @ApiOperation({
    summary:
      'Get deliveries grouped over-by-over for live timeline & commentary',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  @ApiParam({ name: 'inningsNumber', example: 1 })
  getInningsBalls(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @Param('inningsNumber', ParseIntPipe) inningsNumber: number,
  ) {
    return this.scoringService.getInningsBalls(matchId, inningsNumber);
  }

  /**
   * 4. Update live innings state (striker, non-striker, bowler, strike swaps)
   */
  @Patch(':matchId/innings/:inningsNumber/state')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Update live innings state (striker, non-striker, bowler, strike swaps) for immediate persistence',
  })
  @ApiParam({ name: 'matchId', example: '672000000000000000000050' })
  @ApiParam({ name: 'inningsNumber', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Innings state updated successfully',
  })
  updateInningsState(
    @Param('matchId', ObjectIdValidationPipe) matchId: string,
    @Param('inningsNumber', ParseIntPipe) inningsNumber: number,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateInningsStateDto,
  ) {
    return this.scoringService.updateInningsState(
      matchId,
      inningsNumber,
      userId,
      dto,
    );
  }
}
