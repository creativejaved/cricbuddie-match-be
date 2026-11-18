import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import {
  Match,
  MatchStatus,
  MatchType,
  PitchType,
  TossDecision,
} from '../../schemas/match.schema';
import { Inning } from '../../schemas/inning.schema';
import { Ball } from '../../schemas/ball.schema';
import { Team } from '../../schemas/team.schema';
import { MembershipStatus, TeamMember } from '../../schemas/team-member.schema';

describe('MatchesService', () => {
  let service: MatchesService;

  const mockMatchModel: any = jest.fn();
  const mockInningModel: any = jest.fn();
  const mockBallModel: any = jest.fn();
  const mockTeamModel: any = jest.fn();
  const mockTeamMemberModel: any = jest.fn();

  const creatorId = new Types.ObjectId('672000000000000000000001');
  const scorerId = new Types.ObjectId('672000000000000000000002');
  const teamAId = new Types.ObjectId('672000000000000000000010');
  const teamBId = new Types.ObjectId('672000000000000000000020');
  const matchId = new Types.ObjectId('672000000000000000000050');
  const player1Id = new Types.ObjectId('672000000000000000000101');
  const player2Id = new Types.ObjectId('672000000000000000000102');

  const mockTeamA = {
    _id: teamAId,
    name: 'Royal Strikers',
    shortName: 'RS',
    logoUrl: null,
    ownerId: creatorId,
    adminIds: [creatorId],
    isActive: true,
  };

  const mockTeamB = {
    _id: teamBId,
    name: 'Chennai Kings',
    shortName: 'CK',
    logoUrl: null,
    ownerId: scorerId,
    adminIds: [scorerId],
    isActive: true,
  };

  let mockMatchDoc: any;

  beforeEach(async () => {
    mockMatchDoc = {
      _id: matchId,
      matchType: MatchType.LIMITED_OVERS,
      matchFormat: MatchType.LIMITED_OVERS,
      ballsPerOver: 6,
      pitchType: PitchType.TURF,
      oversPerInnings: 20,
      status: MatchStatus.SCHEDULED,
      createdBy: creatorId,
      currentInningsNumber: 1,
      teamA: {
        teamId: teamAId,
        name: 'Royal Strikers',
        shortName: 'RS',
        playingXI: [
          { userId: player1Id, fullName: 'Virat Kohli' },
          { userId: player2Id, fullName: 'AB de Villiers' },
        ],
        runs: 0,
        wickets: 0,
        oversText: '0.0',
      },
      teamB: {
        teamId: teamBId,
        name: 'Chennai Kings',
        shortName: 'CK',
        playingXI: [
          {
            userId: new Types.ObjectId('672000000000000000000201'),
            fullName: 'MS Dhoni',
          },
          {
            userId: new Types.ObjectId('672000000000000000000202'),
            fullName: 'Suresh Raina',
          },
        ],
        runs: 0,
        wickets: 0,
        oversText: '0.0',
      },
      venue: {
        ground: 'Chinnaswamy Stadium',
        groundName: 'Chinnaswamy Stadium',
        city: 'Bengaluru',
      },
      officials: {
        scorerIds: [scorerId],
        scorerId,
        activeScorerId: scorerId,
        umpireIds: [],
        matchRefereeId: null,
        liveStreamerIds: [],
        streamerId: null,
        commentatorIds: [],
      },
      toss: {},
      result: {},
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
      toObject: () => ({ _id: matchId }),
    };

    mockMatchModel.findOne = jest.fn();
    mockMatchModel.findById = jest.fn();
    mockMatchModel.find = jest.fn();
    mockMatchModel.countDocuments = jest.fn().mockResolvedValue(0);

    mockInningModel.findOne = jest.fn();
    mockInningModel.find = jest.fn();
    mockInningModel.updateMany = jest.fn().mockResolvedValue(true);

    mockBallModel.find = jest.fn();

    mockTeamModel.findOne = jest.fn();
    mockTeamModel.findById = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockTeamA),
    });
    mockTeamModel.findByIdAndUpdate = jest.fn().mockResolvedValue(true);

    mockTeamMemberModel.find = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: getModelToken(Match.name), useValue: mockMatchModel },
        { provide: getModelToken(Inning.name), useValue: mockInningModel },
        { provide: getModelToken(Ball.name), useValue: mockBallModel },
        { provide: getModelToken(Team.name), useValue: mockTeamModel },
        {
          provide: getModelToken(TeamMember.name),
          useValue: mockTeamMemberModel,
        },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMatch', () => {
    it('should reject identical team IDs with BadRequestException', async () => {
      await expect(
        service.createMatch(creatorId.toString(), {
          teamAId: teamAId.toString(),
          teamBId: teamAId.toString(),
          matchType: MatchType.LIMITED_OVERS,
          oversPerInnings: 20,
          venue: { ground: 'Chinnaswamy', city: 'Bengaluru' },
          scheduledAt: '2026-11-20T10:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create match when teams are distinct and valid', async () => {
      mockTeamModel.findOne = jest
        .fn()
        .mockResolvedValueOnce(mockTeamA)
        .mockResolvedValueOnce(mockTeamB);

      const saveMock = jest.fn().mockResolvedValue(true);
      mockMatchModel.mockImplementation((dto) => ({
        ...dto,
        _id: matchId,
        save: saveMock,
      }));

      const result = await service.createMatch(creatorId.toString(), {
        teamAId: teamAId.toString(),
        teamBId: teamBId.toString(),
        matchType: MatchType.LIMITED_OVERS,
        oversPerInnings: 20,
        venue: { ground: 'Chinnaswamy', city: 'Bengaluru' },
        scheduledAt: '2026-11-20T10:00:00Z',
      });

      expect(result._id).toBe(matchId);
      expect(saveMock).toHaveBeenCalled();
      expect(result.status).toBe(MatchStatus.SCHEDULED);
      expect(result.teamA.name).toBe('Royal Strikers');
      expect(result.teamB.name).toBe('Chennai Kings');
    });
  });

  describe('setPlayingXI', () => {
    it('should set playing XI for teamA when members are valid active squad players', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockTeamModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTeamA),
      });

      mockTeamMemberModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            userId: player1Id,
            playerSnapshot: {
              userId: player1Id,
              fullName: 'Virat Kohli',
              playerRole: 'TOP_ORDER_BATTER',
            },
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: player2Id,
            playerSnapshot: {
              userId: player2Id,
              fullName: 'AB de Villiers',
              playerRole: 'MIDDLE_ORDER_BATTER',
            },
            status: MembershipStatus.ACTIVE,
          },
        ]),
      });

      const result = await service.setPlayingXI(
        matchId.toString(),
        creatorId.toString(),
        {
          teamSlot: 'teamA',
          playerUserIds: [player1Id.toString(), player2Id.toString()],
          captainId: player1Id.toString(),
          wicketKeeperId: player2Id.toString(),
        },
      );

      expect(result.teamA.playingXI.length).toBe(2);
      expect(result.teamA.captainId.toString()).toBe(player1Id.toString());
      expect(result.teamA.wicketKeeperId.toString()).toBe(player2Id.toString());
    });

    it('should throw BadRequestException if captain is not in playingXI', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockTeamModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTeamA),
      });

      mockTeamMemberModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            userId: player1Id,
            playerSnapshot: { userId: player1Id, fullName: 'Player 1' },
          },
        ]),
      });

      await expect(
        service.setPlayingXI(matchId.toString(), creatorId.toString(), {
          teamSlot: 'teamA',
          playerUserIds: [player1Id.toString()],
          captainId: player2Id.toString(), // not in playing XI
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if playingXI contains duplicate players', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockTeamModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTeamA),
      });

      await expect(
        service.setPlayingXI(matchId.toString(), creatorId.toString(), {
          teamSlot: 'teamA',
          playerUserIds: [player1Id.toString(), player1Id.toString()],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if player is already in opposing team lineup', async () => {
      const opposingPlayerId = new Types.ObjectId('672000000000000000000201');
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockTeamModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTeamA),
      });

      await expect(
        service.setPlayingXI(matchId.toString(), creatorId.toString(), {
          teamSlot: 'teamA',
          playerUserIds: [opposingPlayerId.toString()],
        }),
      ).rejects.toThrow(
        "Player MS Dhoni is already selected in the opposing team's Playing XI",
      );
    });
  });

  describe('recordToss', () => {
    it('should throw BadRequestException if both teams have not announced Playing XI', async () => {
      const matchWithoutLineup: any = {
        ...mockMatchDoc,
        teamA: { ...mockMatchDoc.teamA, playingXI: [] },
      };
      mockMatchModel.findById = jest.fn().mockResolvedValue(matchWithoutLineup);

      await expect(
        service.recordToss(matchId.toString(), creatorId.toString(), {
          wonByTeamId: teamAId.toString(),
          decision: TossDecision.BAT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record toss, transition to LIVE, and initialize Inning 1', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockInningModel.findOne = jest.fn().mockResolvedValue(null);

      const inningSaveMock = jest.fn().mockResolvedValue(true);
      mockInningModel.mockImplementation((dto) => ({
        ...dto,
        _id: new Types.ObjectId(),
        save: inningSaveMock,
      }));

      const result = await service.recordToss(
        matchId.toString(),
        creatorId.toString(),
        {
          wonByTeamId: teamAId.toString(),
          decision: TossDecision.BAT,
        },
      );

      expect(result.match.status).toBe(MatchStatus.LIVE);
      expect(result.match.toss.decision).toBe(TossDecision.BAT);
      expect(result.inning.inningsNumber).toBe(1);
      expect(result.inning.battingTeamId).toBe(teamAId);
      expect(result.inning.bowlingTeamId).toBe(teamBId);
      expect(inningSaveMock).toHaveBeenCalled();
    });
  });

  describe('nextInnings', () => {
    it('should complete Inning 1, calculate target runs, and initialize Inning 2 with swapped teams', async () => {
      mockMatchDoc.currentInningsNumber = 1;
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);

      const inning1Doc = {
        _id: new Types.ObjectId(),
        inningsNumber: 1,
        totalRuns: 180,
        battingTeamId: teamAId,
        bowlingTeamId: teamBId,
        isCompleted: false,
        save: jest.fn().mockResolvedValue(true),
      };

      mockInningModel.findOne = jest
        .fn()
        .mockResolvedValueOnce(inning1Doc) // inning 1
        .mockResolvedValueOnce(null); // inning 2 not yet created

      const inning2SaveMock = jest.fn().mockResolvedValue(true);
      mockInningModel.mockImplementation((dto) => ({
        ...dto,
        save: inning2SaveMock,
      }));

      const result = await service.nextInnings(
        matchId.toString(),
        creatorId.toString(),
      );

      expect(inning1Doc.isCompleted).toBe(true);
      expect(result.match.currentInningsNumber).toBe(2);
      expect(result.inning.inningsNumber).toBe(2);
      expect(result.inning.targetRuns).toBe(181);
      expect(result.inning.battingTeamId).toBe(teamBId);
      expect(result.inning.bowlingTeamId).toBe(teamAId);
    });
  });

  describe('completeMatch', () => {
    it('should finalize result, mark status COMPLETED, and increment team stats', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);

      const result = await service.completeMatch(
        matchId.toString(),
        creatorId.toString(),
        {
          winnerTeamId: teamAId.toString(),
          marginText: 'Royal Strikers won by 15 runs',
        },
      );

      expect(result.status).toBe(MatchStatus.COMPLETED);
      expect(result.result.winnerTeamId.toString()).toBe(teamAId.toString());
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamAId, {
        $inc: { 'stats.matchesPlayed': 1, 'stats.won': 1 },
      });
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamBId, {
        $inc: { 'stats.matchesPlayed': 1, 'stats.lost': 1 },
      });
    });
  });

  describe('updateOfficials', () => {
    it('should update match officials when requested by authorized user', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);

      const newScorerId = new Types.ObjectId('672000000000000000000088');
      const newUmpireId = new Types.ObjectId('672000000000000000000089');
      const newRefereeId = new Types.ObjectId('672000000000000000000095');
      const newStreamerId = new Types.ObjectId('672000000000000000000090');
      const newCommentatorId = new Types.ObjectId('672000000000000000000091');

      const result = await service.updateOfficials(
        matchId.toString(),
        creatorId.toString(),
        {
          scorerIds: [newScorerId.toString()],
          activeScorerId: newScorerId.toString(),
          umpireIds: [newUmpireId.toString()],
          matchRefereeId: newRefereeId.toString(),
          liveStreamerIds: [newStreamerId.toString()],
          commentatorIds: [newCommentatorId.toString()],
        },
      );

      expect(result.officials.scorerIds[0].toString()).toBe(
        newScorerId.toString(),
      );
      expect(result.officials.scorerId.toString()).toBe(newScorerId.toString());
      expect(result.officials.activeScorerId.toString()).toBe(
        newScorerId.toString(),
      );
      expect(result.officials.umpireIds[0].toString()).toBe(
        newUmpireId.toString(),
      );
      expect(result.officials.matchRefereeId.toString()).toBe(
        newRefereeId.toString(),
      );
      expect(result.officials.liveStreamerIds[0].toString()).toBe(
        newStreamerId.toString(),
      );
      expect(result.officials.streamerId.toString()).toBe(
        newStreamerId.toString(),
      );
      expect(result.officials.commentatorIds[0].toString()).toBe(
        newCommentatorId.toString(),
      );
      expect(mockMatchDoc.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not match official or creator', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      const unauthorizedUserId = new Types.ObjectId(
        '672000000000000000000999',
      );

      await expect(
        service.updateOfficials(
          matchId.toString(),
          unauthorizedUserId.toString(),
          {
            scorerId: scorerId.toString(),
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
