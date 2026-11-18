import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Match, MatchDocument } from '../../schemas/match.schema';
import {
  BatterLine,
  BowlerLine,
  FallOfWicket,
  Inning,
  InningDocument,
} from '../../schemas/inning.schema';
import {
  Ball,
  BallDocument,
  DismissalType,
  ExtraType,
} from '../../schemas/ball.schema';
import { SyncBallsDto } from './dto/sync-balls.dto';
import { UndoBallsDto } from './dto/undo-balls.dto';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @InjectModel(Match.name)
    private readonly matchModel: Model<MatchDocument>,
    @InjectModel(Inning.name)
    private readonly inningModel: Model<InningDocument>,
    @InjectModel(Ball.name)
    private readonly ballModel: Model<BallDocument>,
  ) {}

  /**
   * Helper to format cricket overs into string notation (e.g. 26 balls -> "4.2")
   */
  public formatOvers(legalBalls: number, ballsPerOver = 6): string {
    const completedOvers = Math.floor(legalBalls / ballsPerOver);
    const ballsInOver = legalBalls % ballsPerOver;
    return `${completedOvers}.${ballsInOver}`;
  }

  /**
   * Helper to verify if user has authority to score this match
   */
  public isAuthorizedScorer(match: MatchDocument, userId: string): boolean {
    const isCreator = match.createdBy.toString() === userId;
    const isScorer =
      match.officials?.scorerIds?.some((id) => id.toString() === userId) ||
      match.officials?.scorerId?.toString() === userId;
    const isActiveScorer =
      match.officials?.activeScorerId?.toString() === userId;
    return isCreator || isScorer || isActiveScorer;
  }

  /**
   * 1. Idempotent Batch Sync for Deliveries (Offline-First)
   */
  async syncBalls(matchId: string, userId: string, dto: SyncBallsDto) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!this.isAuthorizedScorer(match, userId)) {
      throw new ForbiddenException(
        'You do not have authorization to score deliveries for this match',
      );
    }

    // 1. Identify which clientEventIds already exist for this match
    const clientEventIds = dto.events.map((e) => e.clientEventId);
    const existingBalls = await this.ballModel
      .find(
        {
          matchId: match._id,
          clientEventId: { $in: clientEventIds },
        },
        { clientEventId: 1 },
      )
      .lean();

    const existingIdSet = new Set(existingBalls.map((b) => b.clientEventId));
    const newEvents = dto.events.filter(
      (e) => !existingIdSet.has(e.clientEventId),
    );
    const duplicateCount = dto.events.length - newEvents.length;

    // 2. Insert new events
    if (newEvents.length > 0) {
      const ballDocs = newEvents.map((e) => ({
        matchId: match._id,
        inningsNumber: dto.inningsNumber,
        clientEventId: e.clientEventId,
        sequenceNumber: e.sequenceNumber,
        overNumber: e.overNumber,
        legalBallInOver: e.legalBallInOver,
        bowlerId: new Types.ObjectId(e.bowlerId),
        strikerId: new Types.ObjectId(e.strikerId),
        nonStrikerId: new Types.ObjectId(e.nonStrikerId),
        runsOffBat: e.runsOffBat ?? 0,
        extraType: e.extraType || ExtraType.NONE,
        extraRuns: e.extraRuns ?? 0,
        isLegalDelivery: e.isLegalDelivery,
        isBoundaryFour: Boolean(e.isBoundaryFour),
        isBoundarySix: Boolean(e.isBoundarySix),
        wicket: {
          isWicket: Boolean(e.wicket?.isWicket),
          dismissalType: e.wicket?.dismissalType || null,
          dismissedPlayerId: e.wicket?.dismissedPlayerId
            ? new Types.ObjectId(e.wicket.dismissedPlayerId)
            : null,
          fielderId: e.wicket?.fielderId
            ? new Types.ObjectId(e.wicket.fielderId)
            : null,
        },
        isUndone: false,
        recordedAt: new Date(e.recordedAt),
      }));

      await this.ballModel.insertMany(ballDocs, { ordered: false });
    }

    // 3. Deterministically recompute innings state from active deliveries
    const recomputeResult = await this.recomputeInningsState(
      match._id,
      dto.inningsNumber,
    );

    // 4. Update last synced sequence if any
    const maxSeq = Math.max(
      match.lastSyncedSequence,
      ...dto.events.map((e) => e.sequenceNumber),
    );
    if (maxSeq > match.lastSyncedSequence) {
      match.lastSyncedSequence = maxSeq;
      await match.save();
    }

    return {
      syncedCount: newEvents.length,
      duplicateCount,
      inning: recomputeResult?.inning,
      matchSummary: {
        currentInningsNumber: match.currentInningsNumber,
        teamA: match.teamA,
        teamB: match.teamB,
        lastSyncedSequence: match.lastSyncedSequence,
      },
    };
  }

  /**
   * 2. Reversible Undo Deliveries
   */
  async undoBalls(matchId: string, userId: string, dto: UndoBallsDto) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!this.isAuthorizedScorer(match, userId)) {
      throw new ForbiddenException(
        'You do not have authorization to undo deliveries for this match',
      );
    }

    let filter: Record<string, any>;
    if (dto.upToSequence !== undefined) {
      filter = {
        matchId: match._id,
        inningsNumber: dto.inningsNumber,
        sequenceNumber: { $gte: dto.upToSequence },
        isUndone: false,
      };
    } else {
      const count = dto.count && dto.count > 0 ? dto.count : 1;
      const recentActiveBalls = await this.ballModel
        .find({
          matchId: match._id,
          inningsNumber: dto.inningsNumber,
          isUndone: false,
        })
        .sort({ sequenceNumber: -1 })
        .limit(count)
        .lean();

      const idsToUndo = recentActiveBalls.map((b) => b._id);
      filter = { _id: { $in: idsToUndo } };
    }

    await this.ballModel.updateMany(filter, { $set: { isUndone: true } });

    // Deterministically recompute innings state
    const recomputeResult = await this.recomputeInningsState(
      match._id,
      dto.inningsNumber,
    );

    return {
      message: 'Deliveries undone successfully',
      inning: recomputeResult?.inning,
      matchSummary: {
        currentInningsNumber: match.currentInningsNumber,
        teamA: match.teamA,
        teamB: match.teamB,
      },
    };
  }

  /**
   * 3. Get deliveries grouped over-by-over for live commentary and timeline views
   */
  async getInningsBalls(matchId: string, inningsNumber: number) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const balls = await this.ballModel
      .find({
        matchId: new Types.ObjectId(matchId),
        inningsNumber,
        isUndone: false,
      })
      .sort({ sequenceNumber: 1 })
      .lean();

    const oversMap = new Map<
      number,
      {
        overNumber: number;
        bowlerId: Types.ObjectId;
        legalBalls: number;
        runsInOver: number;
        wicketsInOver: number;
        balls: any[];
      }
    >();

    for (const b of balls) {
      if (!oversMap.has(b.overNumber)) {
        oversMap.set(b.overNumber, {
          overNumber: b.overNumber,
          bowlerId: b.bowlerId,
          legalBalls: 0,
          runsInOver: 0,
          wicketsInOver: 0,
          balls: [],
        });
      }

      const over = oversMap.get(b.overNumber)!;
      over.balls.push(b);
      const totalBallRuns = (b.runsOffBat || 0) + (b.extraRuns || 0);
      over.runsInOver += totalBallRuns;
      if (b.isLegalDelivery) {
        over.legalBalls += 1;
      }
      if (b.wicket?.isWicket) {
        over.wicketsInOver += 1;
      }
      over.bowlerId = b.bowlerId;
    }

    return Array.from(oversMap.values());
  }

  /**
   * 4. Deterministic Recompute Engine
   * Replays all active deliveries for (matchId, inningsNumber) to reconstruct:
   * - Inning totals, wickets, legal balls, extras breakdown
   * - Batting card (runs, balls faced, boundaries, dismissals)
   * - Bowling card (legal balls, maidens, runs conceded, wickets, extras conceded)
   * - Fall of wickets
   * - Current live match summary
   */
  public async recomputeInningsState(
    matchId: Types.ObjectId,
    inningsNumber: number,
  ) {
    const [inning, match] = await Promise.all([
      this.inningModel.findOne({ matchId, inningsNumber }),
      this.matchModel.findById(matchId),
    ]);

    if (!inning || !match) {
      return null;
    }

    const activeBalls = await this.ballModel
      .find({
        matchId,
        inningsNumber,
        isUndone: false,
      })
      .sort({ sequenceNumber: 1 })
      .lean();

    // Seed player names from team playing XI
    const playerMap = new Map<
      string,
      { fullName: string; username?: string | null }
    >();

    for (const p of [
      ...(match.teamA?.playingXI || []),
      ...(match.teamB?.playingXI || []),
    ]) {
      if (p.userId) {
        playerMap.set(p.userId.toString(), {
          fullName: p.fullName,
          username: p.username,
        });
      }
    }

    const ballsPerOver = match.ballsPerOver || 6;

    let totalRuns = 0;
    let totalWickets = 0;
    let legalBallsBowled = 0;
    const extras = {
      wides: 0,
      noBalls: 0,
      byes: 0,
      legByes: 0,
      penalty: 0,
    };

    const battersMap = new Map<string, BatterLine>();
    const bowlersMap = new Map<string, BowlerLine>();
    const fallOfWickets: FallOfWicket[] = [];

    // Bowler over tracking for calculating maidens
    // bowlerId -> Map<overNumber, { legalBalls: number, runsConceded: number }>
    const bowlerOvers = new Map<
      string,
      Map<number, { legalBalls: number; runsConceded: number }>
    >();

    const getOrCreateBatter = (id: Types.ObjectId): BatterLine => {
      const key = id.toString();
      if (!battersMap.has(key)) {
        const info = playerMap.get(key) || {
          fullName: `Player ${key.slice(-4)}`,
        };
        battersMap.set(key, {
          playerId: id,
          fullName: info.fullName,
          username: info.username || null,
          runs: 0,
          ballsFaced: 0,
          fours: 0,
          sixes: 0,
          isOut: false,
          dismissalText: 'not out',
          bowlerId: null,
          fielderId: null,
        });
      }
      return battersMap.get(key)!;
    };

    const getOrCreateBowler = (id: Types.ObjectId): BowlerLine => {
      const key = id.toString();
      if (!bowlersMap.has(key)) {
        const info = playerMap.get(key) || {
          fullName: `Player ${key.slice(-4)}`,
        };
        bowlersMap.set(key, {
          playerId: id,
          fullName: info.fullName,
          username: info.username || null,
          legalBalls: 0,
          maidens: 0,
          runsConceded: 0,
          wickets: 0,
          wides: 0,
          noBalls: 0,
        });
      }
      return bowlersMap.get(key)!;
    };

    for (const b of activeBalls) {
      const runsOffBat = b.runsOffBat || 0;
      const extraRuns = b.extraRuns || 0;
      totalRuns += runsOffBat + extraRuns;

      // Extras breakdown
      switch (b.extraType) {
        case ExtraType.WIDE:
          extras.wides += extraRuns;
          break;
        case ExtraType.NO_BALL:
          extras.noBalls += extraRuns;
          break;
        case ExtraType.BYE:
          extras.byes += extraRuns;
          break;
        case ExtraType.LEG_BYE:
          extras.legByes += extraRuns;
          break;
        case ExtraType.PENALTY:
          extras.penalty += extraRuns;
          break;
      }

      // Legal delivery counter
      if (b.isLegalDelivery) {
        legalBallsBowled += 1;
      }

      // Batter stats
      const striker = getOrCreateBatter(b.strikerId);
      getOrCreateBatter(b.nonStrikerId); // ensure non-striker is recorded on the batting card

      striker.runs += runsOffBat;
      // In cricket, balls faced counts on all deliveries except WIDES
      if (b.extraType !== ExtraType.WIDE) {
        striker.ballsFaced += 1;
      }
      if (b.isBoundaryFour) {
        striker.fours += 1;
      }
      if (b.isBoundarySix) {
        striker.sixes += 1;
      }

      // Bowler stats
      const bowler = getOrCreateBowler(b.bowlerId);
      if (b.isLegalDelivery) {
        bowler.legalBalls += 1;
      }

      // In cricket, Byes, Leg Byes and Penalties do NOT count against the bowler's runs conceded
      if (
        b.extraType !== ExtraType.BYE &&
        b.extraType !== ExtraType.LEG_BYE &&
        b.extraType !== ExtraType.PENALTY
      ) {
        bowler.runsConceded += runsOffBat + extraRuns;
      }

      if (b.extraType === ExtraType.WIDE) {
        bowler.wides += extraRuns;
      }
      if (b.extraType === ExtraType.NO_BALL) {
        bowler.noBalls += extraRuns;
      }

      // Maiden over tracking
      const bKey = b.bowlerId.toString();
      if (!bowlerOvers.has(bKey)) {
        bowlerOvers.set(bKey, new Map());
      }
      const overMap = bowlerOvers.get(bKey)!;
      if (!overMap.has(b.overNumber)) {
        overMap.set(b.overNumber, { legalBalls: 0, runsConceded: 0 });
      }
      const oData = overMap.get(b.overNumber)!;
      if (b.isLegalDelivery) {
        oData.legalBalls += 1;
      }
      if (
        b.extraType !== ExtraType.BYE &&
        b.extraType !== ExtraType.LEG_BYE &&
        b.extraType !== ExtraType.PENALTY
      ) {
        oData.runsConceded += runsOffBat + extraRuns;
      }

      // Wickets
      if (b.wicket?.isWicket) {
        totalWickets += 1;
        const dismissedId = b.wicket.dismissedPlayerId || b.strikerId;
        const dismissedBatter = getOrCreateBatter(dismissedId);
        dismissedBatter.isOut = true;

        const bowlerName =
          playerMap.get(b.bowlerId.toString())?.fullName || 'bowler';
        const fielderName = b.wicket.fielderId
          ? playerMap.get(b.wicket.fielderId.toString())?.fullName || 'fielder'
          : '';

        let dismissalText = 'out';
        switch (b.wicket.dismissalType) {
          case DismissalType.BOWLED:
            dismissalText = `b ${bowlerName}`;
            break;
          case DismissalType.CAUGHT:
            dismissalText = fielderName
              ? `c ${fielderName} b ${bowlerName}`
              : `c & b ${bowlerName}`;
            break;
          case DismissalType.LBW:
            dismissalText = `lbw b ${bowlerName}`;
            break;
          case DismissalType.RUN_OUT:
            dismissalText = fielderName
              ? `run out (${fielderName})`
              : 'run out';
            break;
          case DismissalType.STUMPED:
            dismissalText = fielderName
              ? `st ${fielderName} b ${bowlerName}`
              : `st b ${bowlerName}`;
            break;
          case DismissalType.HIT_WICKET:
            dismissalText = `hit wicket b ${bowlerName}`;
            break;
          case DismissalType.RETIRED_HURT:
            dismissalText = 'retired hurt';
            break;
          default:
            dismissalText = `b ${bowlerName}`;
        }

        dismissedBatter.dismissalText = dismissalText;
        dismissedBatter.bowlerId = b.bowlerId;
        dismissedBatter.fielderId = b.wicket.fielderId || null;

        // Credit wicket to bowler (Run out and retired hurt do not credit bowler)
        if (
          b.wicket.dismissalType !== DismissalType.RUN_OUT &&
          b.wicket.dismissalType !== DismissalType.RETIRED_HURT
        ) {
          bowler.wickets += 1;
        }

        fallOfWickets.push({
          wicketNumber: totalWickets,
          score: totalRuns,
          overText: this.formatOvers(legalBallsBowled, ballsPerOver),
          dismissedPlayerId: dismissedId,
          ballSequence: b.sequenceNumber,
        });
      }
    }

    // Maidens calculation
    for (const [bKey, overMap] of bowlerOvers.entries()) {
      const bowler = bowlersMap.get(bKey);
      if (bowler) {
        let maidens = 0;
        for (const oData of overMap.values()) {
          if (oData.legalBalls >= ballsPerOver && oData.runsConceded === 0) {
            maidens += 1;
          }
        }
        bowler.maidens = maidens;
      }
    }

    // Current State
    const latestBall = activeBalls[activeBalls.length - 1];
    const currentState = {
      strikerId: latestBall ? latestBall.strikerId : null,
      nonStrikerId: latestBall ? latestBall.nonStrikerId : null,
      currentBowlerId: latestBall ? latestBall.bowlerId : null,
      currentOverNumber: Math.floor(legalBallsBowled / ballsPerOver) + 1,
    };

    // Save Inning
    inning.totalRuns = totalRuns;
    inning.totalWickets = totalWickets;
    inning.legalBallsBowled = legalBallsBowled;
    inning.extras = extras;
    inning.currentState = currentState;
    inning.battingCard = Array.from(battersMap.values());
    inning.bowlingCard = Array.from(bowlersMap.values());
    inning.fallOfWickets = fallOfWickets;
    await inning.save();

    // Sync summary score into Match document
    const isTeamABatting = match.teamA.teamId.equals(inning.battingTeamId);
    const battingSlot = isTeamABatting ? match.teamA : match.teamB;

    battingSlot.runs = totalRuns;
    battingSlot.wickets = totalWickets;
    battingSlot.oversText = this.formatOvers(legalBallsBowled, ballsPerOver);

    match.markModified(isTeamABatting ? 'teamA' : 'teamB');
    await match.save();

    return { inning, match };
  }
}
