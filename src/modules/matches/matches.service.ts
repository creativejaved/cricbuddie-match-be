import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Match,
  MatchDocument,
  MatchStatus,
  MatchType,
  PitchType,
  TossDecision,
} from '../../schemas/match.schema';
import { Inning, InningDocument } from '../../schemas/inning.schema';
import { Ball, BallDocument } from '../../schemas/ball.schema';
import { Team, TeamDocument } from '../../schemas/team.schema';
import {
  MembershipStatus,
  TeamMember,
  TeamMemberDocument,
} from '../../schemas/team-member.schema';
import { CreateMatchDto } from './dto/create-match.dto';
import { QueryMatchesDto } from './dto/query-matches.dto';
import { SetPlayingXIDto } from './dto/set-playing-xi.dto';
import { RecordTossDto } from './dto/record-toss.dto';
import { CompleteMatchDto } from './dto/complete-match.dto';
import { UpdateMatchOfficialsDto } from './dto/update-match-officials.dto';
import { AssignScorerDto } from './dto/assign-scorer.dto';
import { StartMatchDto } from './dto/start-match.dto';
import { StartNextInningsDto } from './dto/start-next-innings.dto';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    @InjectModel(Match.name)
    private readonly matchModel: Model<MatchDocument>,
    @InjectModel(Inning.name)
    private readonly inningModel: Model<InningDocument>,
    @InjectModel(Ball.name)
    private readonly ballModel: Model<BallDocument>,
    @InjectModel(Team.name)
    private readonly teamModel: Model<TeamDocument>,
    @InjectModel(TeamMember.name)
    private readonly teamMemberModel: Model<TeamMemberDocument>,
  ) {}

  /**
   * Helper to verify whether a user has scoring or administrative authority on a match
   */
  public isMatchScorerOrCreator(match: MatchDocument, userId: string): boolean {
    const isCreator = match.createdBy.toString() === userId;
    const isScorer =
      match.officials?.scorerIds?.some((id) => id.toString() === userId) ||
      match.officials?.scorerId?.toString() === userId;
    const isActiveScorer =
      match.officials?.activeScorerId?.toString() === userId;
    return isCreator || isScorer || isActiveScorer;
  }

  /**
   * 1. Create a new Match
   */
  async createMatch(userId: string, dto: CreateMatchDto) {
    if (dto.teamAId === dto.teamBId) {
      throw new BadRequestException('teamA and teamB must be distinct teams');
    }

    if (
      !Types.ObjectId.isValid(dto.teamAId) ||
      !Types.ObjectId.isValid(dto.teamBId)
    ) {
      throw new BadRequestException('Invalid Team ID format');
    }

    const [teamA, teamB] = await Promise.all([
      this.teamModel.findOne({
        _id: new Types.ObjectId(dto.teamAId),
        isActive: true,
      }),
      this.teamModel.findOne({
        _id: new Types.ObjectId(dto.teamBId),
        isActive: true,
      }),
    ]);

    if (!teamA) {
      throw new NotFoundException(`Team A (${dto.teamAId}) not found`);
    }
    if (!teamB) {
      throw new NotFoundException(`Team B (${dto.teamBId}) not found`);
    }

    const creatorObjectId = new Types.ObjectId(userId);

    // Resolve officials with defaults
    const officialsDto = dto.officials || {};
    const rawScorerIds =
      officialsDto.scorerIds ||
      dto.scorerIds ||
      (dto.scorerId ? [dto.scorerId] : []);

    let scorerObjectIds: Types.ObjectId[];
    let activeScorerObjectId: Types.ObjectId;

    if (rawScorerIds && rawScorerIds.length > 0) {
      scorerObjectIds = rawScorerIds
        .slice(0, 2)
        .map((id) => new Types.ObjectId(id));
      activeScorerObjectId = officialsDto.activeScorerId
        ? new Types.ObjectId(officialsDto.activeScorerId)
        : scorerObjectIds[0];
    } else {
      scorerObjectIds = [creatorObjectId];
      activeScorerObjectId = creatorObjectId;
    }

    const umpireObjectIds = (officialsDto.umpireIds || dto.umpireIds || [])
      .slice(0, 4)
      .map((id) => new Types.ObjectId(id));

    const matchRefereeObjectId =
      officialsDto.matchRefereeId || dto.matchRefereeId
        ? new Types.ObjectId(officialsDto.matchRefereeId || dto.matchRefereeId)
        : null;

    const rawStreamerIds =
      officialsDto.liveStreamerIds ||
      dto.liveStreamerIds ||
      (dto.streamerId ? [dto.streamerId] : []);
    const liveStreamerObjectIds = rawStreamerIds
      .slice(0, 2)
      .map((id) => new Types.ObjectId(id));

    const commentatorObjectIds = (
      officialsDto.commentatorIds ||
      dto.commentatorIds ||
      []
    )
      .slice(0, 2)
      .map((id) => new Types.ObjectId(id));

    const matchType =
      dto.matchType || dto.matchFormat || MatchType.LIMITED_OVERS;
    const ballsPerOver =
      dto.ballsPerOver ?? (matchType === MatchType.THE_HUNDRED ? 5 : 6);
    const pitchType = dto.pitchType || PitchType.TURF;
    const venueGround = dto.venue.ground || (dto.venue as any).groundName;

    const match = new this.matchModel({
      tournamentId: dto.tournamentId
        ? new Types.ObjectId(dto.tournamentId)
        : null,
      matchType,
      matchFormat: matchType,
      ballsPerOver,
      pitchType,
      oversPerInnings: dto.oversPerInnings,
      ballType: dto.ballType,
      venue: {
        ground: venueGround,
        groundName: venueGround,
        city: dto.venue.city,
      },
      scheduledAt: dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : new Date(),
      status: MatchStatus.SCHEDULED,
      createdBy: creatorObjectId,
      teamA: {
        teamId: teamA._id,
        name: teamA.name,
        shortName: teamA.shortName,
        logoUrl: teamA.logoUrl,
        playingXI: [],
        runs: 0,
        wickets: 0,
        oversText: '0.0',
      },
      teamB: {
        teamId: teamB._id,
        name: teamB.name,
        shortName: teamB.shortName,
        logoUrl: teamB.logoUrl,
        playingXI: [],
        runs: 0,
        wickets: 0,
        oversText: '0.0',
      },
      officials: {
        scorerIds: scorerObjectIds,
        scorerId: scorerObjectIds[0],
        activeScorerId: activeScorerObjectId,
        umpireIds: umpireObjectIds,
        matchRefereeId: matchRefereeObjectId,
        liveStreamerIds: liveStreamerObjectIds,
        streamerId: liveStreamerObjectIds[0] || null,
        commentatorIds: commentatorObjectIds,
      },
      toss: {},
      currentInningsNumber: 1,
      result: {},
      lastSyncedSequence: 0,
    });

    await match.save();
    return match;
  }

  /**
   * 2. Paginated list of Matches
   */
  async getMatches(query: QueryMatchesDto, currentUserId?: string) {
    const filter: Record<string, any> = {};
    const andConditions: any[] = [];

    if (query.status) {
      filter.status = query.status;
      andConditions.push({ status: query.status });
    }

    if (query.pitchType) {
      filter.pitchType = query.pitchType;
    }

    if (query.city) {
      filter['venue.city'] = new RegExp(query.city.trim(), 'i');
    }

    if (query.matchType) {
      andConditions.push({
        $or: [
          { matchType: query.matchType },
          { matchFormat: query.matchType },
        ],
      });
    }

    if (query.teamId && Types.ObjectId.isValid(query.teamId)) {
      const teamObjectId = new Types.ObjectId(query.teamId);
      andConditions.push({
        $or: [
          { 'teamA.teamId': teamObjectId },
          { 'teamB.teamId': teamObjectId },
        ],
      });
    }

    const targetUserId =
      query.userId || (query.myMatches ? currentUserId : null);
    if (targetUserId) {
      if (query.myMatches && !currentUserId) {
        throw new ForbiddenException(
          'Authentication required to filter personal matches',
        );
      }
      if (Types.ObjectId.isValid(targetUserId)) {
        const userObjectId = new Types.ObjectId(targetUserId);
        andConditions.push({
          $or: [
            { createdBy: userObjectId },
            { 'officials.scorerIds': userObjectId },
            { 'officials.scorerId': userObjectId },
            { 'officials.activeScorerId': userObjectId },
            { 'officials.umpireIds': userObjectId },
            { 'teamA.playingXI.userId': userObjectId },
            { 'teamB.playingXI.userId': userObjectId },
          ],
        });
      }
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.matchModel
        .find(filter)
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.matchModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Alias for getMatches to support findAll query conventions
   */
  async findAll(query: QueryMatchesDto, currentUserId?: string) {
    return this.getMatches(query, currentUserId);
  }

  /**
   * 3. Get match details + innings scorecards + recent deliveries
   */
  async getMatchById(matchId: string) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId).lean();
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const [innings, recentBalls] = await Promise.all([
      this.inningModel
        .find({ matchId: match._id })
        .sort({ inningsNumber: 1 })
        .lean(),
      this.ballModel
        .find({
          matchId: match._id,
          inningsNumber: match.currentInningsNumber,
          isUndone: false,
        })
        .sort({ sequenceNumber: -1 })
        .limit(18)
        .lean(),
    ]);

    // Reverse to chronological order for live score timeline
    recentBalls.reverse();

    return Object.assign({}, match, {
      innings,
      recentBalls,
    });
  }

  /**
   * 4. Set Playing XI for Team A or Team B
   */
  async setPlayingXI(matchId: string, userId: string, dto: SetPlayingXIDto) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (
      match.status !== MatchStatus.SCHEDULED &&
      match.status !== MatchStatus.TOSS
    ) {
      throw new BadRequestException(
        `Cannot modify Playing XI when match status is ${match.status}`,
      );
    }

    const targetTeamId =
      dto.teamSlot === 'teamA' ? match.teamA.teamId : match.teamB.teamId;

    // Check permissions: creator, scorer, or team owner/admin
    const isScorerOrCreator = this.isMatchScorerOrCreator(match, userId);
    let isTeamAdmin = false;
    const teamDoc = await this.teamModel.findById(targetTeamId).lean();
    if (teamDoc) {
      const isOwner = teamDoc.ownerId.toString() === userId;
      const isAdmin =
        teamDoc.adminIds?.some((id) => id.toString() === userId) || false;
      isTeamAdmin = isOwner || isAdmin;
    }

    if (!isScorerOrCreator && !isTeamAdmin) {
      throw new ForbiddenException(
        'Only match officials or team administrators can set the Playing XI',
      );
    }

    // 1. Check for duplicate player IDs
    const uniqueIds = new Set(dto.playerUserIds);
    if (uniqueIds.size !== dto.playerUserIds.length) {
      throw new BadRequestException('Playing XI contains duplicate players');
    }

    // 2. Prevent cross-team player overlap (cannot play for both teams)
    const opposingSlot = dto.teamSlot === 'teamA' ? match.teamB : match.teamA;
    const opposingPlayerIds = new Set(
      (opposingSlot.playingXI || []).map((p) => p.userId.toString()),
    );
    const conflictingPlayer = dto.playerUserIds.find((id) =>
      opposingPlayerIds.has(id),
    );
    if (conflictingPlayer) {
      const opposingPlayer = (opposingSlot.playingXI || []).find(
        (p) => p.userId?.toString() === conflictingPlayer,
      );
      const playerName = opposingPlayer?.fullName || conflictingPlayer;
      throw new BadRequestException(
        `Player ${playerName} is already selected in the opposing team's Playing XI`,
      );
    }

    // Verify all players are active squad members
    const playerObjectIds = dto.playerUserIds.map(
      (id) => new Types.ObjectId(id),
    );
    const activeMembers = await this.teamMemberModel
      .find({
        teamId: targetTeamId,
        userId: { $in: playerObjectIds },
        status: MembershipStatus.ACTIVE,
      })
      .lean();

    if (activeMembers.length !== playerObjectIds.length) {
      const foundIds = new Set(activeMembers.map((m) => m.userId.toString()));
      const missingIds = dto.playerUserIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Selected players are not active squad members: ${missingIds.join(', ')}`,
      );
    }

    if (dto.captainId) {
      if (!dto.playerUserIds.includes(dto.captainId)) {
        throw new BadRequestException('Captain must be part of the Playing XI');
      }
    }

    if (dto.wicketKeeperId) {
      if (!dto.playerUserIds.includes(dto.wicketKeeperId)) {
        throw new BadRequestException(
          'Wicket keeper must be part of the Playing XI',
        );
      }
    }

    const snapshots = activeMembers.map((m) => m.playerSnapshot);
    const targetSlot = dto.teamSlot === 'teamA' ? match.teamA : match.teamB;
    targetSlot.playingXI = snapshots;

    if (dto.captainId) {
      targetSlot.captainId = new Types.ObjectId(dto.captainId);
    }
    if (dto.wicketKeeperId) {
      targetSlot.wicketKeeperId = new Types.ObjectId(dto.wicketKeeperId);
    }

    match.markModified(dto.teamSlot);
    await match.save();

    return match;
  }

  /**
   * Helper to initialize openers, bowler, and active scorer on an Inning and Match
   */
  private applyOpenersAndBowler(
    match: MatchDocument,
    inning: InningDocument,
    dto: {
      strikerId?: string;
      nonStrikerId?: string;
      bowlerId?: string;
      scorerUserId?: string;
    },
  ) {
    if (dto.scorerUserId && Types.ObjectId.isValid(dto.scorerUserId)) {
      const sId = new Types.ObjectId(dto.scorerUserId);
      if (!match.officials) {
        match.officials = {
          scorerIds: [],
          scorerId: null,
          activeScorerId: null,
          umpireIds: [],
          matchRefereeId: null,
          liveStreamerIds: [],
          streamerId: null,
          commentatorIds: [],
        };
      }
      match.officials.activeScorerId = sId;
      match.officials.scorerId = sId;
      if (!match.officials.scorerIds.some((id) => id.equals(sId))) {
        if (match.officials.scorerIds.length >= 2) {
          match.officials.scorerIds[1] = sId;
        } else {
          match.officials.scorerIds.push(sId);
        }
      }
      match.markModified('officials');
    }

    const isTeamABatting = match.teamA.teamId.equals(inning.battingTeamId);
    const battingSlot = isTeamABatting ? match.teamA : match.teamB;
    const bowlingSlot = isTeamABatting ? match.teamB : match.teamA;

    if (
      dto.strikerId &&
      dto.nonStrikerId &&
      dto.strikerId === dto.nonStrikerId
    ) {
      throw new BadRequestException(
        'Striker and non-striker must be distinct players',
      );
    }

    if (!inning.currentState) {
      inning.currentState = { currentOverNumber: 1 };
    }
    if (!inning.battingCard) {
      inning.battingCard = [];
    }
    if (!inning.bowlingCard) {
      inning.bowlingCard = [];
    }

    if (dto.strikerId) {
      if (!Types.ObjectId.isValid(dto.strikerId)) {
        throw new BadRequestException('Invalid striker ID format');
      }
      const player = (battingSlot.playingXI || []).find(
        (p) => p.userId?.toString() === dto.strikerId,
      );
      if (!player) {
        throw new BadRequestException(
          'Striker must be an announced player in the batting team Playing XI',
        );
      }
      const strikerObjectId = new Types.ObjectId(dto.strikerId);
      inning.currentState.strikerId = strikerObjectId;

      if (!inning.battingCard.some((b) => b.playerId.equals(strikerObjectId))) {
        inning.battingCard.push({
          playerId: strikerObjectId,
          fullName: player.fullName,
          username: player.username || null,
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
    }

    if (dto.nonStrikerId) {
      if (!Types.ObjectId.isValid(dto.nonStrikerId)) {
        throw new BadRequestException('Invalid non-striker ID format');
      }
      const player = (battingSlot.playingXI || []).find(
        (p) => p.userId?.toString() === dto.nonStrikerId,
      );
      if (!player) {
        throw new BadRequestException(
          'Non-striker must be an announced player in the batting team Playing XI',
        );
      }
      const nonStrikerObjectId = new Types.ObjectId(dto.nonStrikerId);
      inning.currentState.nonStrikerId = nonStrikerObjectId;

      if (
        !inning.battingCard.some((b) => b.playerId.equals(nonStrikerObjectId))
      ) {
        inning.battingCard.push({
          playerId: nonStrikerObjectId,
          fullName: player.fullName,
          username: player.username || null,
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
    }

    if (dto.bowlerId) {
      if (!Types.ObjectId.isValid(dto.bowlerId)) {
        throw new BadRequestException('Invalid bowler ID format');
      }
      const player = (bowlingSlot.playingXI || []).find(
        (p) => p.userId?.toString() === dto.bowlerId,
      );
      if (!player) {
        throw new BadRequestException(
          'Opening bowler must be an announced player in the bowling team Playing XI',
        );
      }
      const bowlerObjectId = new Types.ObjectId(dto.bowlerId);
      inning.currentState.currentBowlerId = bowlerObjectId;

      if (!inning.bowlingCard.some((b) => b.playerId.equals(bowlerObjectId))) {
        inning.bowlingCard.push({
          playerId: bowlerObjectId,
          fullName: player.fullName,
          username: player.username || null,
          legalBalls: 0,
          maidens: 0,
          runsConceded: 0,
          wickets: 0,
          wides: 0,
          noBalls: 0,
        });
      }
    }

    if (typeof inning.markModified === 'function') {
      inning.markModified('currentState');
      inning.markModified('battingCard');
      inning.markModified('bowlingCard');
    }
  }

  /**
   * Reassign or set active match scorer
   */
  async assignScorer(
    matchId: string,
    requesterId: string,
    dto: AssignScorerDto,
  ) {
    if (
      !Types.ObjectId.isValid(matchId) ||
      !Types.ObjectId.isValid(dto.scorerUserId)
    ) {
      throw new BadRequestException('Invalid ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const isScorerOrCreator = this.isMatchScorerOrCreator(match, requesterId);
    let isTeamAdmin = false;

    if (!isScorerOrCreator) {
      const [teamA, teamB] = await Promise.all([
        this.teamModel.findById(match.teamA.teamId).lean(),
        this.teamModel.findById(match.teamB.teamId).lean(),
      ]);
      const isTeamAAdmin =
        teamA?.ownerId.toString() === requesterId ||
        teamA?.adminIds?.some((id) => id.toString() === requesterId);
      const isTeamBAdmin =
        teamB?.ownerId.toString() === requesterId ||
        teamB?.adminIds?.some((id) => id.toString() === requesterId);
      isTeamAdmin = Boolean(isTeamAAdmin || isTeamBAdmin);
    }

    if (!isScorerOrCreator && !isTeamAdmin) {
      throw new ForbiddenException(
        'Only match officials, creator, or team administrators can assign scorers',
      );
    }

    if (!match.officials) {
      match.officials = {
        scorerIds: [],
        scorerId: null,
        activeScorerId: null,
        umpireIds: [],
        matchRefereeId: null,
        liveStreamerIds: [],
        streamerId: null,
        commentatorIds: [],
      };
    }

    const scorerObjectId = new Types.ObjectId(dto.scorerUserId);
    match.officials.activeScorerId = scorerObjectId;
    match.officials.scorerId = scorerObjectId;

    if (!match.officials.scorerIds.some((id) => id.equals(scorerObjectId))) {
      if (match.officials.scorerIds.length >= 2) {
        match.officials.scorerIds[1] = scorerObjectId;
      } else {
        match.officials.scorerIds.push(scorerObjectId);
      }
    }

    match.markModified('officials');
    await match.save();
    return match;
  }

  /**
   * Explicitly start a match and initialize Inning #1 with openers & opening bowler
   */
  async startMatch(matchId: string, userId: string, dto: StartMatchDto) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!this.isMatchScorerOrCreator(match, userId)) {
      throw new ForbiddenException(
        'Only match officials or creator can start the match',
      );
    }

    if (
      match.status === MatchStatus.COMPLETED ||
      match.status === MatchStatus.ABANDONED
    ) {
      throw new BadRequestException(
        `Cannot start match when status is ${match.status}`,
      );
    }

    // Both teams must announce Playing XI before starting
    if (
      !match.teamA?.playingXI?.length ||
      match.teamA.playingXI.length < 2 ||
      !match.teamB?.playingXI?.length ||
      match.teamB.playingXI.length < 2
    ) {
      throw new BadRequestException(
        'Both teams must announce Playing XI before starting the match',
      );
    }

    // Handle toss if provided or already recorded
    if (dto.wonByTeamId && dto.decision) {
      const wonByTeamId = new Types.ObjectId(dto.wonByTeamId);
      const isTeamA = match.teamA.teamId.equals(wonByTeamId);
      const isTeamB = match.teamB.teamId.equals(wonByTeamId);
      if (!isTeamA && !isTeamB) {
        throw new BadRequestException('Toss winner must be teamA or teamB');
      }
      match.toss = {
        wonByTeamId,
        decision: dto.decision,
      };
    } else if (!match.toss?.wonByTeamId || !match.toss?.decision) {
      throw new BadRequestException(
        'Toss must be recorded before starting the match',
      );
    }

    const wonByTeamId = match.toss.wonByTeamId;
    const isTeamA = match.teamA.teamId.equals(wonByTeamId);
    let battingTeamId: Types.ObjectId;
    let bowlingTeamId: Types.ObjectId;

    if (isTeamA) {
      if (match.toss.decision === TossDecision.BAT) {
        battingTeamId = match.teamA.teamId;
        bowlingTeamId = match.teamB.teamId;
      } else {
        battingTeamId = match.teamB.teamId;
        bowlingTeamId = match.teamA.teamId;
      }
    } else {
      if (match.toss.decision === TossDecision.BAT) {
        battingTeamId = match.teamB.teamId;
        bowlingTeamId = match.teamA.teamId;
      } else {
        battingTeamId = match.teamA.teamId;
        bowlingTeamId = match.teamB.teamId;
      }
    }

    match.status = MatchStatus.LIVE;
    match.currentInningsNumber = 1;

    let inning1 = await this.inningModel.findOne({
      matchId: match._id,
      inningsNumber: 1,
    });

    if (!inning1) {
      inning1 = new this.inningModel({
        matchId: match._id,
        inningsNumber: 1,
        battingTeamId,
        bowlingTeamId,
        isCompleted: false,
        totalRuns: 0,
        totalWickets: 0,
        legalBallsBowled: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        currentState: { currentOverNumber: 1 },
        battingCard: [],
        bowlingCard: [],
        fallOfWickets: [],
      });
    } else {
      inning1.battingTeamId = battingTeamId;
      inning1.bowlingTeamId = bowlingTeamId;
    }

    this.applyOpenersAndBowler(match, inning1, dto);

    await Promise.all([match.save(), inning1.save()]);

    return {
      match,
      inning: inning1,
    };
  }

  /**
   * 5. Record Toss and initialize Innings #1
   */
  async recordToss(matchId: string, userId: string, dto: RecordTossDto) {
    if (
      !Types.ObjectId.isValid(matchId) ||
      !Types.ObjectId.isValid(dto.wonByTeamId)
    ) {
      throw new BadRequestException('Invalid ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!this.isMatchScorerOrCreator(match, userId)) {
      throw new ForbiddenException(
        'Only match officials or creator can record the toss',
      );
    }

    if (
      match.status !== MatchStatus.SCHEDULED &&
      match.status !== MatchStatus.TOSS
    ) {
      throw new BadRequestException(
        `Cannot record toss when match status is ${match.status}`,
      );
    }

    // Both teams must announce Playing XI before recording toss
    if (
      !match.teamA?.playingXI?.length ||
      match.teamA.playingXI.length < 2 ||
      !match.teamB?.playingXI?.length ||
      match.teamB.playingXI.length < 2
    ) {
      throw new BadRequestException(
        'Both teams must announce Playing XI before recording toss',
      );
    }

    const wonByTeamId = new Types.ObjectId(dto.wonByTeamId);
    const isTeamA = match.teamA.teamId.equals(wonByTeamId);
    const isTeamB = match.teamB.teamId.equals(wonByTeamId);

    if (!isTeamA && !isTeamB) {
      throw new BadRequestException('Toss winner must be teamA or teamB');
    }

    let battingTeamId: Types.ObjectId;
    let bowlingTeamId: Types.ObjectId;

    if (isTeamA) {
      if (dto.decision === TossDecision.BAT) {
        battingTeamId = match.teamA.teamId;
        bowlingTeamId = match.teamB.teamId;
      } else {
        battingTeamId = match.teamB.teamId;
        bowlingTeamId = match.teamA.teamId;
      }
    } else {
      if (dto.decision === TossDecision.BAT) {
        battingTeamId = match.teamB.teamId;
        bowlingTeamId = match.teamA.teamId;
      } else {
        battingTeamId = match.teamA.teamId;
        bowlingTeamId = match.teamB.teamId;
      }
    }

    match.toss = {
      wonByTeamId,
      decision: dto.decision,
    };
    match.status = MatchStatus.LIVE;
    match.currentInningsNumber = 1;

    let inning1 = await this.inningModel.findOne({
      matchId: match._id,
      inningsNumber: 1,
    });

    if (!inning1) {
      inning1 = new this.inningModel({
        matchId: match._id,
        inningsNumber: 1,
        battingTeamId,
        bowlingTeamId,
        isCompleted: false,
        totalRuns: 0,
        totalWickets: 0,
        legalBallsBowled: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        currentState: { currentOverNumber: 1 },
        battingCard: [],
        bowlingCard: [],
        fallOfWickets: [],
      });
    } else {
      inning1.battingTeamId = battingTeamId;
      inning1.bowlingTeamId = bowlingTeamId;
    }

    this.applyOpenersAndBowler(match, inning1, dto);

    await Promise.all([match.save(), inning1.save()]);

    return {
      match,
      inning: inning1,
    };
  }

  /**
   * 6. Transition to Next Innings (Innings 1 -> Innings 2)
   */
  async nextInnings(
    matchId: string,
    userId: string,
    dto?: StartNextInningsDto,
  ) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!this.isMatchScorerOrCreator(match, userId)) {
      throw new ForbiddenException(
        'Only match officials or creator can transition innings',
      );
    }

    if (match.currentInningsNumber !== 1) {
      throw new BadRequestException('Match is already on or past Innings 2');
    }

    const inning1 = await this.inningModel.findOne({
      matchId: match._id,
      inningsNumber: 1,
    });

    if (!inning1) {
      throw new NotFoundException('Innings 1 not found for this match');
    }

    inning1.isCompleted = true;
    await inning1.save();

    const targetRuns = inning1.totalRuns + 1;

    let inning2 = await this.inningModel.findOne({
      matchId: match._id,
      inningsNumber: 2,
    });

    if (!inning2) {
      inning2 = new this.inningModel({
        matchId: match._id,
        inningsNumber: 2,
        battingTeamId: inning1.bowlingTeamId,
        bowlingTeamId: inning1.battingTeamId,
        targetRuns,
        isCompleted: false,
        totalRuns: 0,
        totalWickets: 0,
        legalBallsBowled: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        currentState: { currentOverNumber: 1 },
        battingCard: [],
        bowlingCard: [],
        fallOfWickets: [],
      });
    } else {
      inning2.battingTeamId = inning1.bowlingTeamId;
      inning2.bowlingTeamId = inning1.battingTeamId;
      inning2.targetRuns = targetRuns;
    }

    if (dto) {
      this.applyOpenersAndBowler(match, inning2, dto);
    }

    await inning2.save();

    match.currentInningsNumber = 2;
    match.status = MatchStatus.LIVE;
    await match.save();

    return {
      match,
      inning: inning2,
    };
  }

  /**
   * 7. Finalize and complete match with atomic Team.stats update
   */
  async completeMatch(matchId: string, userId: string, dto: CompleteMatchDto) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!this.isMatchScorerOrCreator(match, userId)) {
      throw new ForbiddenException(
        'Only match officials or creator can complete the match',
      );
    }

    // Complete active inning if any
    await this.inningModel.updateMany(
      { matchId: match._id, isCompleted: false },
      { $set: { isCompleted: true } },
    );

    match.status = MatchStatus.COMPLETED;
    match.result = {
      winnerTeamId: dto.winnerTeamId
        ? new Types.ObjectId(dto.winnerTeamId)
        : null,
      isTie: Boolean(dto.isTie),
      isNoResult: Boolean(dto.isNoResult),
      marginText: dto.marginText || null,
      playerOfMatchId: dto.playerOfMatchId
        ? new Types.ObjectId(dto.playerOfMatchId)
        : null,
    };

    await match.save();

    // Atomically increment team stats
    const teamAId = match.teamA.teamId;
    const teamBId = match.teamB.teamId;

    if (dto.isTie) {
      await Promise.all([
        this.teamModel.findByIdAndUpdate(teamAId, {
          $inc: { 'stats.matchesPlayed': 1, 'stats.tied': 1 },
        }),
        this.teamModel.findByIdAndUpdate(teamBId, {
          $inc: { 'stats.matchesPlayed': 1, 'stats.tied': 1 },
        }),
      ]);
    } else if (dto.isNoResult) {
      await Promise.all([
        this.teamModel.findByIdAndUpdate(teamAId, {
          $inc: { 'stats.matchesPlayed': 1, 'stats.noResult': 1 },
        }),
        this.teamModel.findByIdAndUpdate(teamBId, {
          $inc: { 'stats.matchesPlayed': 1, 'stats.noResult': 1 },
        }),
      ]);
    } else if (dto.winnerTeamId) {
      const winnerId = new Types.ObjectId(dto.winnerTeamId);
      const loserId = winnerId.equals(teamAId) ? teamBId : teamAId;
      await Promise.all([
        this.teamModel.findByIdAndUpdate(winnerId, {
          $inc: { 'stats.matchesPlayed': 1, 'stats.won': 1 },
        }),
        this.teamModel.findByIdAndUpdate(loserId, {
          $inc: { 'stats.matchesPlayed': 1, 'stats.lost': 1 },
        }),
      ]);
    }

    return match;
  }

  /**
   * 8. Update Match Officials (Scorer, Umpires, Streamers, Commentators)
   */
  async updateOfficials(
    matchId: string,
    userId: string,
    dto: UpdateMatchOfficialsDto,
  ) {
    if (!Types.ObjectId.isValid(matchId)) {
      throw new BadRequestException('Invalid match ID format');
    }

    const match = await this.matchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!this.isMatchScorerOrCreator(match, userId)) {
      throw new ForbiddenException(
        'Only match officials or creator can update officials',
      );
    }

    if (!match.officials) {
      match.officials = {
        scorerIds: [],
        scorerId: null,
        activeScorerId: null,
        umpireIds: [],
        matchRefereeId: null,
        liveStreamerIds: [],
        streamerId: null,
        commentatorIds: [],
      };
    }

    if (dto.scorerIds !== undefined) {
      match.officials.scorerIds = dto.scorerIds
        .slice(0, 2)
        .map((id) => new Types.ObjectId(id));
      match.officials.scorerId = match.officials.scorerIds[0] || null;
      if (!match.officials.activeScorerId && match.officials.scorerIds.length > 0) {
        match.officials.activeScorerId = match.officials.scorerIds[0];
      }
    } else if (dto.scorerId !== undefined) {
      const sId = dto.scorerId ? new Types.ObjectId(dto.scorerId) : null;
      match.officials.scorerId = sId;
      match.officials.scorerIds = sId ? [sId] : [];
    }

    if (dto.activeScorerId !== undefined) {
      match.officials.activeScorerId = dto.activeScorerId
        ? new Types.ObjectId(dto.activeScorerId)
        : null;
    }

    if (dto.umpireIds !== undefined) {
      match.officials.umpireIds = dto.umpireIds
        .slice(0, 4)
        .map((id) => new Types.ObjectId(id));
    }

    if (dto.matchRefereeId !== undefined) {
      match.officials.matchRefereeId = dto.matchRefereeId
        ? new Types.ObjectId(dto.matchRefereeId)
        : null;
    }

    if (dto.liveStreamerIds !== undefined) {
      match.officials.liveStreamerIds = dto.liveStreamerIds
        .slice(0, 2)
        .map((id) => new Types.ObjectId(id));
      match.officials.streamerId = match.officials.liveStreamerIds[0] || null;
    } else if (dto.streamerId !== undefined) {
      const stId = dto.streamerId ? new Types.ObjectId(dto.streamerId) : null;
      match.officials.streamerId = stId;
      match.officials.liveStreamerIds = stId ? [stId] : [];
    }

    if (dto.commentatorIds !== undefined) {
      match.officials.commentatorIds = dto.commentatorIds
        .slice(0, 2)
        .map((id) => new Types.ObjectId(id));
    }

    match.markModified('officials');
    await match.save();

    return match;
  }
}
