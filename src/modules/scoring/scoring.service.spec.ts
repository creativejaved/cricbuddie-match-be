import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ForbiddenException } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { Match, MatchStatus } from '../../schemas/match.schema';
import { Inning } from '../../schemas/inning.schema';
import { Ball, DismissalType, ExtraType } from '../../schemas/ball.schema';

describe('ScoringService', () => {
  let service: ScoringService;

  const mockMatchModel: any = jest.fn();
  const mockInningModel: any = jest.fn();
  const mockBallModel: any = jest.fn();

  const matchId = new Types.ObjectId('672000000000000000000050');
  const scorerId = new Types.ObjectId('672000000000000000000002');
  const teamAId = new Types.ObjectId('672000000000000000000010');
  const teamBId = new Types.ObjectId('672000000000000000000020');
  const batter1Id = new Types.ObjectId('672000000000000000000101');
  const batter2Id = new Types.ObjectId('672000000000000000000102');
  const bowler1Id = new Types.ObjectId('672000000000000000000201');

  const mockMatchDoc: any = {
    _id: matchId,
    status: MatchStatus.LIVE,
    createdBy: scorerId,
    currentInningsNumber: 1,
    lastSyncedSequence: 0,
    teamA: {
      teamId: teamAId,
      name: 'Royal Strikers',
      shortName: 'RS',
      playingXI: [
        { userId: batter1Id, fullName: 'Virat Kohli' },
        { userId: batter2Id, fullName: 'AB de Villiers' },
      ],
      runs: 0,
      wickets: 0,
      oversText: '0.0',
    },
    teamB: {
      teamId: teamBId,
      name: 'Chennai Kings',
      shortName: 'CK',
      playingXI: [{ userId: bowler1Id, fullName: 'Jasprit Bumrah' }],
      runs: 0,
      wickets: 0,
      oversText: '0.0',
    },
    officials: {
      scorerIds: [scorerId],
      scorerId,
      activeScorerId: scorerId,
    },
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(true),
  };

  const mockInningDoc: any = {
    _id: new Types.ObjectId(),
    matchId,
    inningsNumber: 1,
    battingTeamId: teamAId,
    bowlingTeamId: teamBId,
    totalRuns: 0,
    totalWickets: 0,
    legalBallsBowled: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    currentState: {},
    battingCard: [],
    bowlingCard: [],
    fallOfWickets: [],
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    mockMatchModel.findById = jest.fn();
    mockInningModel.findOne = jest.fn();
    mockBallModel.find = jest.fn();
    mockBallModel.insertMany = jest.fn().mockResolvedValue(true);
    mockBallModel.updateMany = jest.fn().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        { provide: getModelToken(Match.name), useValue: mockMatchModel },
        { provide: getModelToken(Inning.name), useValue: mockInningModel },
        { provide: getModelToken(Ball.name), useValue: mockBallModel },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('formatOvers', () => {
    it('should format legal balls into cricket over notation', () => {
      expect(service.formatOvers(0)).toBe('0.0');
      expect(service.formatOvers(1)).toBe('0.1');
      expect(service.formatOvers(5)).toBe('0.5');
      expect(service.formatOvers(6)).toBe('1.0');
      expect(service.formatOvers(26)).toBe('4.2');
    });

    it('should format legal balls with custom ballsPerOver (e.g. 5 for THE_HUNDRED)', () => {
      expect(service.formatOvers(0, 5)).toBe('0.0');
      expect(service.formatOvers(4, 5)).toBe('0.4');
      expect(service.formatOvers(5, 5)).toBe('1.0');
      expect(service.formatOvers(12, 5)).toBe('2.2');
    });
  });

  describe('isAuthorizedScorer', () => {
    it('should authorize match creator, activeScorerId, or any scorer in scorerIds', () => {
      const coScorerId = new Types.ObjectId('672000000000000000000991');
      const testMatch: any = {
        createdBy: scorerId,
        officials: {
          scorerIds: [scorerId, coScorerId],
          activeScorerId: coScorerId,
        },
      };

      expect(
        service.isAuthorizedScorer(testMatch, scorerId.toString()),
      ).toBe(true);
      expect(
        service.isAuthorizedScorer(testMatch, coScorerId.toString()),
      ).toBe(true);
      expect(
        service.isAuthorizedScorer(
          testMatch,
          '672000000000000000000999',
        ),
      ).toBe(false);
    });
  });

  describe('syncBalls', () => {
    it('should throw ForbiddenException if user is not authorized scorer', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);

      await expect(
        service.syncBalls(
          matchId.toString(),
          '672000000000000000000999', // unauthorized user
          {
            inningsNumber: 1,
            events: [],
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deduplicate existing clientEventId and recompute state for new deliveries', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockInningModel.findOne = jest.fn().mockResolvedValue(mockInningDoc);

      // Suppose clientEvent1 already exists, clientEvent2 is new
      mockBallModel.find = jest
        .fn()
        // 1. query for existing events
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue([{ clientEventId: 'evt-1' }]),
        })
        // 2. query inside recomputeInningsState for active deliveries
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                sequenceNumber: 1,
                overNumber: 1,
                legalBallInOver: 1,
                strikerId: batter1Id,
                nonStrikerId: batter2Id,
                bowlerId: bowler1Id,
                runsOffBat: 4,
                extraType: ExtraType.NONE,
                extraRuns: 0,
                isLegalDelivery: true,
                isBoundaryFour: true,
                isBoundarySix: false,
                isUndone: false,
              },
            ]),
          }),
        });

      const result = await service.syncBalls(
        matchId.toString(),
        scorerId.toString(),
        {
          inningsNumber: 1,
          events: [
            {
              clientEventId: 'evt-1',
              sequenceNumber: 1,
              overNumber: 1,
              legalBallInOver: 1,
              bowlerId: bowler1Id.toString(),
              strikerId: batter1Id.toString(),
              nonStrikerId: batter2Id.toString(),
              runsOffBat: 4,
              isLegalDelivery: true,
              isBoundaryFour: true,
              recordedAt: '2026-11-20T10:00:00Z',
            },
            {
              clientEventId: 'evt-2',
              sequenceNumber: 2,
              overNumber: 1,
              legalBallInOver: 2,
              bowlerId: bowler1Id.toString(),
              strikerId: batter1Id.toString(),
              nonStrikerId: batter2Id.toString(),
              runsOffBat: 1,
              isLegalDelivery: true,
              recordedAt: '2026-11-20T10:01:00Z',
            },
          ],
        },
      );

      expect(result.duplicateCount).toBe(1);
      expect(result.syncedCount).toBe(1);
      expect(mockBallModel.insertMany).toHaveBeenCalledTimes(1);
      expect(mockInningDoc.totalRuns).toBe(4);
      expect(mockInningDoc.legalBallsBowled).toBe(1);
      expect(mockInningDoc.save).toHaveBeenCalled();
    });
  });

  describe('recomputeInningsState', () => {
    it('should correctly calculate cricket rules (extras, balls faced, maidens, wickets)', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockInningModel.findOne = jest.fn().mockResolvedValue(mockInningDoc);

      const activeBalls = [
        // Over 1 - Maiden by bowler1
        {
          sequenceNumber: 1,
          overNumber: 1,
          legalBallInOver: 1,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isLegalDelivery: true,
        },
        {
          sequenceNumber: 2,
          overNumber: 1,
          legalBallInOver: 2,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isLegalDelivery: true,
        },
        {
          sequenceNumber: 3,
          overNumber: 1,
          legalBallInOver: 3,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isLegalDelivery: true,
        },
        {
          sequenceNumber: 4,
          overNumber: 1,
          legalBallInOver: 4,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isLegalDelivery: true,
        },
        {
          sequenceNumber: 5,
          overNumber: 1,
          legalBallInOver: 5,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isLegalDelivery: true,
        },
        {
          sequenceNumber: 6,
          overNumber: 1,
          legalBallInOver: 6,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isLegalDelivery: true,
        },
        // Over 2: ball with WIDE (does not count ballsFaced)
        {
          sequenceNumber: 7,
          overNumber: 2,
          legalBallInOver: 1,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.WIDE,
          extraRuns: 1,
          isLegalDelivery: false,
        },
        // Over 2: Wicket delivery
        {
          sequenceNumber: 8,
          overNumber: 2,
          legalBallInOver: 1,
          strikerId: batter1Id,
          nonStrikerId: batter2Id,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isLegalDelivery: true,
          wicket: {
            isWicket: true,
            dismissalType: DismissalType.BOWLED,
            dismissedPlayerId: batter1Id,
          },
        },
      ];

      mockBallModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(activeBalls),
        }),
      });

      const result = await service.recomputeInningsState(matchId, 1);

      expect(result).not.toBeNull();
      expect(mockInningDoc.totalRuns).toBe(1); // 1 wide
      expect(mockInningDoc.totalWickets).toBe(1);
      expect(mockInningDoc.legalBallsBowled).toBe(7);
      expect(mockInningDoc.extras.wides).toBe(1);

      // Check batter1 stats: faced 6 + 1 = 7 balls (wide not counted)
      const b1 = mockInningDoc.battingCard.find(
        (b: any) => b.playerId.toString() === batter1Id.toString(),
      );
      expect(b1.ballsFaced).toBe(7);
      expect(b1.isOut).toBe(true);
      expect(b1.dismissalText).toContain('b Jasprit Bumrah');

      // Check bowler1 stats: 1 maiden in over 1, 1 wicket, 1 wide
      const bowl1 = mockInningDoc.bowlingCard.find(
        (b: any) => b.playerId.toString() === bowler1Id.toString(),
      );
      expect(bowl1.maidens).toBe(1);
      expect(bowl1.wickets).toBe(1);
      expect(bowl1.runsConceded).toBe(1);
    });
  });

  describe('undoBalls', () => {
    it('should mark deliveries as isUndone: true and recompute state', async () => {
      mockMatchModel.findById = jest.fn().mockResolvedValue(mockMatchDoc);
      mockInningModel.findOne = jest.fn().mockResolvedValue(mockInningDoc);

      mockBallModel.find = jest
        .fn()
        // find recent balls to undo
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest
                .fn()
                .mockResolvedValue([{ _id: new Types.ObjectId() }]),
            }),
          }),
        })
        // query for recomputeInningsState
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        });

      const result = await service.undoBalls(
        matchId.toString(),
        scorerId.toString(),
        {
          inningsNumber: 1,
          count: 1,
        },
      );

      expect(result.message).toContain('undone successfully');
      expect(mockBallModel.updateMany).toHaveBeenCalledWith(
        expect.any(Object),
        { $set: { isUndone: true } },
      );
    });
  });

  describe('getInningsBalls', () => {
    it('should return deliveries grouped by overNumber', async () => {
      const balls = [
        {
          overNumber: 1,
          bowlerId: bowler1Id,
          runsOffBat: 1,
          extraRuns: 0,
          isLegalDelivery: true,
        },
        {
          overNumber: 1,
          bowlerId: bowler1Id,
          runsOffBat: 4,
          extraRuns: 0,
          isLegalDelivery: true,
          isBoundaryFour: true,
        },
        {
          overNumber: 2,
          bowlerId: bowler1Id,
          runsOffBat: 0,
          extraRuns: 1,
          extraType: ExtraType.WIDE,
          isLegalDelivery: false,
        },
      ];

      mockBallModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(balls),
        }),
      });

      const result = await service.getInningsBalls(matchId.toString(), 1);

      expect(result.length).toBe(2);
      expect(result[0].overNumber).toBe(1);
      expect(result[0].legalBalls).toBe(2);
      expect(result[0].runsInOver).toBe(5);
      expect(result[1].overNumber).toBe(2);
      expect(result[1].legalBalls).toBe(0);
      expect(result[1].runsInOver).toBe(1);
    });
  });
});
