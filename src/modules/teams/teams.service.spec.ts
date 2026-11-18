import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { Team, TeamJoinPolicy } from '../../schemas/team.schema';
import {
  MembershipStatus,
  SquadRole,
  TeamMember,
} from '../../schemas/team-member.schema';
import { IdentityClientService } from '../identity-client/identity-client.service';
import { InvitationAction } from './dto/respond-invitation.dto';
import { RequestAction } from './dto/respond-request.dto';
import { QueryRosterStatus } from './dto/query-team-members.dto';

describe('TeamsService', () => {
  let service: TeamsService;
  let identityClientService: IdentityClientService;

  const mockTeamModel: any = jest.fn();
  const mockTeamMemberModel: any = jest.fn();

  const ownerId = new Types.ObjectId('672000000000000000000001');
  const adminId = new Types.ObjectId('672000000000000000000002');
  const playerId = new Types.ObjectId('672000000000000000000003');
  const player2Id = new Types.ObjectId('672000000000000000000004');
  const teamId = new Types.ObjectId('672000000000000000000010');

  const mockTeamDoc: any = {
    _id: teamId,
    name: 'Bangalore Blasters',
    shortName: 'BLR',
    city: 'Bengaluru',
    ownerId,
    adminIds: [ownerId, adminId],
    joinPolicy: TeamJoinPolicy.APPROVAL,
    inviteCode: 'BLR123',
    isInviteActive: true,
    activeMemberCount: 2,
    isActive: true,
    save: jest.fn().mockResolvedValue(true),
    toObject: jest.fn().mockReturnValue({
      _id: teamId,
      name: 'Bangalore Blasters',
      shortName: 'BLR',
      city: 'Bengaluru',
      ownerId,
      adminIds: [ownerId, adminId],
      joinPolicy: TeamJoinPolicy.APPROVAL,
      inviteCode: 'BLR123',
      isInviteActive: true,
      activeMemberCount: 2,
    }),
  };

  beforeEach(async () => {
    mockTeamModel.findOne = jest.fn();
    mockTeamModel.findByIdAndUpdate = jest.fn().mockResolvedValue(true);
    mockTeamMemberModel.find = jest.fn();
    mockTeamMemberModel.findOne = jest.fn();
    mockTeamMemberModel.findById = jest.fn();
    mockTeamMemberModel.findByIdAndDelete = jest.fn().mockResolvedValue(true);
    mockTeamMemberModel.countDocuments = jest.fn().mockResolvedValue(0);
    mockTeamMemberModel.updateOne = jest.fn().mockResolvedValue(true);
    mockTeamMemberModel.updateMany = jest.fn().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: getModelToken(Team.name),
          useValue: mockTeamModel,
        },
        {
          provide: getModelToken(TeamMember.name),
          useValue: mockTeamMemberModel,
        },
        {
          provide: IdentityClientService,
          useValue: {
            getUserSnapshot: jest.fn(),
            getBatchSnapshots: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WEB_APP_URL') return 'http://localhost:5173';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    identityClientService = module.get<IdentityClientService>(
      IdentityClientService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTeam', () => {
    it('should create team, assign creator as OWNER with ACTIVE status', async () => {
      jest.spyOn(identityClientService, 'getUserSnapshot').mockResolvedValue({
        userId: ownerId.toString(),
        fullName: 'Captain Rogers',
        username: 'rogers',
        playerRole: 'ALL_ROUNDER',
        jerseyNumber: 7,
        avatarUrl: null,
        allowDirectTeamAdd: true,
      });

      mockTeamModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const teamSaveMock = jest.fn().mockResolvedValue(true);
      const memberSaveMock = jest.fn().mockResolvedValue(true);

      mockTeamModel.mockImplementation((dto) => ({
        ...dto,
        _id: teamId,
        save: teamSaveMock,
        toObject: () => ({ ...dto, _id: teamId }),
      }));

      mockTeamMemberModel.mockImplementation((dto) => ({
        ...dto,
        _id: new Types.ObjectId(),
        save: memberSaveMock,
      }));

      const result = await service.createTeam(ownerId.toString(), {
        name: 'Royal Strikers',
        shortName: 'RS',
        city: 'Mumbai',
        joinPolicy: TeamJoinPolicy.OPEN,
      });

      expect(result.team.name).toBe('Royal Strikers');
      expect(result.team.shortName).toBe('RS');
      expect(result.team.inviteUrl).toContain('/teams/join/');
      expect(result.membership.squadRole).toBe(SquadRole.OWNER);
      expect(result.membership.status).toBe(MembershipStatus.ACTIVE);
      expect(teamSaveMock).toHaveBeenCalled();
      expect(memberSaveMock).toHaveBeenCalled();
    });
  });

  describe('getTeamById', () => {
    it('should return team details and compute rosterCounts for OWNER/ADMIN', async () => {
      mockTeamModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: teamId,
          name: 'Bangalore Blasters',
          shortName: 'BLR',
          inviteCode: 'BLR123',
          ownerId,
          adminIds: [ownerId, adminId],
          isActive: true,
        }),
      });

      mockTeamMemberModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            userId: ownerId,
            squadRole: SquadRole.OWNER,
          },
        ]),
      });

      mockTeamMemberModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          squadRole: SquadRole.OWNER,
          status: MembershipStatus.ACTIVE,
        }),
      });

      mockTeamMemberModel.countDocuments = jest
        .fn()
        .mockResolvedValueOnce(5) // active
        .mockResolvedValueOnce(2) // pending invites
        .mockResolvedValueOnce(3); // join requests

      const result = await service.getTeamById(
        teamId.toString(),
        ownerId.toString(),
      );
      expect(result.name).toBe('Bangalore Blasters');
      expect(result.inviteUrl).toBe('http://localhost:5173/teams/join/BLR123');
      expect(result.members.length).toBe(1);
      expect(result.myMembership?.squadRole).toBe(SquadRole.OWNER);
      expect(result.rosterCounts).toEqual({
        active: 5,
        pendingInvites: 2,
        joinRequests: 3,
      });
    });

    it('should omit rosterCounts for guests and non-admin viewers', async () => {
      mockTeamModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: teamId,
          name: 'Bangalore Blasters',
          shortName: 'BLR',
          inviteCode: 'BLR123',
          ownerId,
          adminIds: [ownerId, adminId],
          isActive: true,
        }),
      });

      mockTeamMemberModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      mockTeamMemberModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getTeamById(
        teamId.toString(),
        playerId.toString(), // regular player
      );
      expect(result.rosterCounts).toBeUndefined();
    });

    it('should throw NotFoundException if team does not exist', async () => {
      mockTeamModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getTeamById(teamId.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTeamMembers', () => {
    it('should return paginated ACTIVE squad members for any viewer', async () => {
      mockTeamModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTeamDoc),
      });

      mockTeamMemberModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([{ userId: playerId }]),
            }),
          }),
        }),
      });

      mockTeamMemberModel.countDocuments = jest.fn().mockResolvedValue(1);

      const result = await service.getTeamMembers(teamId.toString(), {
        status: QueryRosterStatus.ACTIVE,
        page: 1,
        limit: 20,
      });

      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should throw ForbiddenException when non-admin attempts to view PENDING_PLAYER', async () => {
      mockTeamModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTeamDoc),
      });

      await expect(
        service.getTeamMembers(
          teamId.toString(),
          { status: QueryRosterStatus.PENDING_PLAYER },
          playerId.toString(), // not owner or admin
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow OWNER to view PENDING_ADMIN requests', async () => {
      mockTeamModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockTeamDoc),
      });

      mockTeamMemberModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([{ userId: playerId }]),
            }),
          }),
        }),
      });

      mockTeamMemberModel.countDocuments = jest.fn().mockResolvedValue(1);

      const result = await service.getTeamMembers(
        teamId.toString(),
        { status: QueryRosterStatus.PENDING_ADMIN },
        ownerId.toString(),
      );

      expect(result.items.length).toBe(1);
    });
  });

  describe('updateMemberRole', () => {
    it('should reject assigning OWNER role with BadRequestException', async () => {
      await expect(
        service.updateMemberRole(
          teamId.toString(),
          playerId.toString(),
          ownerId.toString(),
          { squadRole: SquadRole.OWNER },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject modifying the team OWNER', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: ownerId,
        squadRole: SquadRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });

      await expect(
        service.updateMemberRole(
          teamId.toString(),
          ownerId.toString(),
          ownerId.toString(),
          { squadRole: SquadRole.ADMIN },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should promote member to ADMIN and add to team.adminIds', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);

      const memberDoc = {
        _id: new Types.ObjectId(),
        userId: playerId,
        squadRole: SquadRole.PLAYER,
        status: MembershipStatus.ACTIVE,
        save: jest.fn().mockResolvedValue(true),
      };
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(memberDoc);

      const result = await service.updateMemberRole(
        teamId.toString(),
        memberDoc._id.toString(),
        ownerId.toString(),
        { squadRole: SquadRole.ADMIN },
      );

      expect(result.squadRole).toBe(SquadRole.ADMIN);
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
        $addToSet: { adminIds: playerId },
      });
    });

    it('should assign CAPTAIN, demoting existing CAPTAIN to PLAYER', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);

      const memberDoc = {
        _id: new Types.ObjectId(),
        userId: playerId,
        squadRole: SquadRole.PLAYER,
        status: MembershipStatus.ACTIVE,
        save: jest.fn().mockResolvedValue(true),
      };
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(memberDoc);

      const result = await service.updateMemberRole(
        teamId.toString(),
        memberDoc._id.toString(),
        ownerId.toString(),
        { squadRole: SquadRole.CAPTAIN },
      );

      expect(result.squadRole).toBe(SquadRole.CAPTAIN);
      expect(mockTeamMemberModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ squadRole: SquadRole.CAPTAIN }),
        expect.objectContaining({ $set: { squadRole: SquadRole.PLAYER } }),
      );
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
        $pull: { adminIds: playerId },
      });
    });
  });

  describe('addMember', () => {
    it('should throw ForbiddenException if requester is not owner or admin', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);

      await expect(
        service.addMember(teamId.toString(), playerId.toString(), {
          targetUserId: '672000000000000000000099',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if user is already an active member', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue({
        status: MembershipStatus.ACTIVE,
      });

      await expect(
        service.addMember(teamId.toString(), ownerId.toString(), {
          targetUserId: playerId.toString(),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should add member directly as ACTIVE if target has allowDirectTeamAdd=true', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(null);

      jest.spyOn(identityClientService, 'getUserSnapshot').mockResolvedValue({
        userId: playerId.toString(),
        fullName: 'Jasprit Bumrah',
        username: 'bumrah',
        playerRole: 'BOWLER',
        jerseyNumber: 93,
        avatarUrl: null,
        allowDirectTeamAdd: true,
      });

      const memberSaveMock = jest.fn().mockResolvedValue(true);
      mockTeamMemberModel.mockImplementation((dto) => ({
        ...dto,
        save: memberSaveMock,
      }));

      const result = await service.addMember(
        teamId.toString(),
        ownerId.toString(),
        {
          targetUserId: playerId.toString(),
          squadRole: SquadRole.PLAYER,
        },
      );

      expect(result.status).toBe(MembershipStatus.ACTIVE);
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
        $inc: { activeMemberCount: 1 },
      });
    });

    it('should set status to PENDING_PLAYER if target has allowDirectTeamAdd=false', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(null);

      jest.spyOn(identityClientService, 'getUserSnapshot').mockResolvedValue({
        userId: playerId.toString(),
        fullName: 'Private Player',
        username: 'priv',
        playerRole: null,
        jerseyNumber: null,
        avatarUrl: null,
        allowDirectTeamAdd: false,
      });

      mockTeamMemberModel.mockImplementation((dto) => ({
        ...dto,
        save: jest.fn().mockResolvedValue(true),
      }));

      const result = await service.addMember(
        teamId.toString(),
        ownerId.toString(),
        {
          targetUserId: playerId.toString(),
        },
      );

      expect(result.status).toBe(MembershipStatus.PENDING_PLAYER);
      expect(mockTeamModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('respondToInvitation', () => {
    it('should throw ForbiddenException if user responding is not the target player', async () => {
      const membershipDoc = {
        _id: new Types.ObjectId(),
        userId: playerId,
        status: MembershipStatus.PENDING_PLAYER,
      };
      mockTeamMemberModel.findById = jest.fn().mockResolvedValue(membershipDoc);

      await expect(
        service.respondToInvitation(
          membershipDoc._id.toString(),
          ownerId.toString(),
          { action: InvitationAction.ACCEPT },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should activate membership and increment team count when accepted', async () => {
      const membershipDoc = {
        _id: new Types.ObjectId(),
        teamId,
        userId: playerId,
        status: MembershipStatus.PENDING_PLAYER,
        save: jest.fn().mockResolvedValue(true),
      };
      mockTeamMemberModel.findById = jest.fn().mockResolvedValue(membershipDoc);

      const result = (await service.respondToInvitation(
        membershipDoc._id.toString(),
        playerId.toString(),
        { action: InvitationAction.ACCEPT },
      )) as any;

      expect(result.status).toBe(MembershipStatus.ACTIVE);
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
        $inc: { activeMemberCount: 1 },
      });
    });

    it('should delete membership record when declined (REJECT)', async () => {
      const membershipDoc = {
        _id: new Types.ObjectId(),
        teamId,
        userId: playerId,
        status: MembershipStatus.PENDING_PLAYER,
      };
      mockTeamMemberModel.findById = jest.fn().mockResolvedValue(membershipDoc);

      const result = (await service.respondToInvitation(
        membershipDoc._id.toString(),
        playerId.toString(),
        { action: InvitationAction.REJECT },
      )) as any;

      expect(result.message).toContain('declined');
      expect(mockTeamMemberModel.findByIdAndDelete).toHaveBeenCalledWith(
        membershipDoc._id,
      );
      expect(mockTeamModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('joinViaInviteCode', () => {
    it('should throw ForbiddenException if team invite is inactive', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue({
        ...mockTeamDoc,
        isInviteActive: false,
      });

      await expect(
        service.joinViaInviteCode('BLR123', playerId.toString()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if team is INVITE_ONLY', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue({
        ...mockTeamDoc,
        isInviteActive: true,
        joinPolicy: TeamJoinPolicy.INVITE_ONLY,
      });

      await expect(
        service.joinViaInviteCode('BLR123', playerId.toString()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should join as ACTIVE if joinPolicy is OPEN', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue({
        ...mockTeamDoc,
        isInviteActive: true,
        joinPolicy: TeamJoinPolicy.OPEN,
      });
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(null);

      jest.spyOn(identityClientService, 'getUserSnapshot').mockResolvedValue({
        userId: playerId.toString(),
        fullName: 'New Player',
        username: 'newp',
        playerRole: null,
        jerseyNumber: null,
        avatarUrl: null,
        allowDirectTeamAdd: false,
      });

      mockTeamMemberModel.mockImplementation((dto) => ({
        ...dto,
        save: jest.fn().mockResolvedValue(true),
      }));

      const result = await service.joinViaInviteCode(
        'BLR123',
        playerId.toString(),
      );
      expect(result.membership.status).toBe(MembershipStatus.ACTIVE);
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
        $inc: { activeMemberCount: 1 },
      });
    });

    it('should join as PENDING_ADMIN if joinPolicy is APPROVAL', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue({
        ...mockTeamDoc,
        isInviteActive: true,
        joinPolicy: TeamJoinPolicy.APPROVAL,
      });
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(null);

      jest.spyOn(identityClientService, 'getUserSnapshot').mockResolvedValue({
        userId: playerId.toString(),
        fullName: 'Approval Player',
        username: 'appp',
        playerRole: null,
        jerseyNumber: null,
        avatarUrl: null,
        allowDirectTeamAdd: false,
      });

      mockTeamMemberModel.mockImplementation((dto) => ({
        ...dto,
        save: jest.fn().mockResolvedValue(true),
      }));

      const result = await service.joinViaInviteCode(
        'BLR123',
        playerId.toString(),
      );
      expect(result.membership.status).toBe(MembershipStatus.PENDING_ADMIN);
      expect(mockTeamModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('respondToJoinRequest', () => {
    it('should approve join request and increment member count', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);

      const membershipDoc = {
        _id: new Types.ObjectId(),
        teamId,
        status: MembershipStatus.PENDING_ADMIN,
        save: jest.fn().mockResolvedValue(true),
      };
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(membershipDoc);

      const result = (await service.respondToJoinRequest(
        teamId.toString(),
        membershipDoc._id.toString(),
        ownerId.toString(),
        { action: RequestAction.APPROVE },
      )) as any;

      expect(result.status).toBe(MembershipStatus.ACTIVE);
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
        $inc: { activeMemberCount: 1 },
      });
    });

    it('should delete join request on REJECT', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);

      const membershipDoc = {
        _id: new Types.ObjectId(),
        teamId,
        status: MembershipStatus.PENDING_ADMIN,
      };
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(membershipDoc);

      const result = await service.respondToJoinRequest(
        teamId.toString(),
        membershipDoc._id.toString(),
        ownerId.toString(),
        { action: RequestAction.REJECT },
      );

      expect(result.message).toContain('rejected');
      expect(mockTeamMemberModel.findByIdAndDelete).toHaveBeenCalledWith(
        membershipDoc._id,
      );
      expect(mockTeamModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('removeMemberOrLeave', () => {
    it('should prevent the team OWNER from leaving without transferring ownership', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: ownerId,
        squadRole: SquadRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });

      await expect(
        service.removeMemberOrLeave(
          teamId.toString(),
          ownerId.toString(),
          ownerId.toString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent an ADMIN from removing another ADMIN or OWNER', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        userId: ownerId,
        squadRole: SquadRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });

      await expect(
        service.removeMemberOrLeave(
          teamId.toString(),
          ownerId.toString(),
          adminId.toString(), // Admin attempting to remove owner
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow a PLAYER to leave, delete the record, and decrement member count', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);

      const playerMembership = {
        _id: new Types.ObjectId(),
        userId: playerId,
        squadRole: SquadRole.PLAYER,
        status: MembershipStatus.ACTIVE,
      };
      mockTeamMemberModel.findOne = jest
        .fn()
        .mockResolvedValue(playerMembership);

      const result = await service.removeMemberOrLeave(
        teamId.toString(),
        playerMembership._id.toString(),
        playerId.toString(),
      );

      expect(result.message).toContain('successfully left the team');
      expect(mockTeamMemberModel.findByIdAndDelete).toHaveBeenCalledWith(
        playerMembership._id,
      );
      expect(mockTeamModel.findByIdAndUpdate).toHaveBeenCalledWith(teamId, {
        $set: { adminIds: [ownerId, adminId], activeMemberCount: 1 },
      });
    });

    it('should allow canceling a PENDING_PLAYER invite without decrementing activeMemberCount', async () => {
      mockTeamModel.findOne = jest.fn().mockResolvedValue(mockTeamDoc);

      const pendingInvite = {
        _id: new Types.ObjectId(),
        userId: player2Id,
        squadRole: SquadRole.PLAYER,
        status: MembershipStatus.PENDING_PLAYER,
      };
      mockTeamMemberModel.findOne = jest.fn().mockResolvedValue(pendingInvite);

      const result = await service.removeMemberOrLeave(
        teamId.toString(),
        pendingInvite._id.toString(),
        ownerId.toString(),
      );

      expect(result.message).toContain('cancelled');
      expect(mockTeamMemberModel.findByIdAndDelete).toHaveBeenCalledWith(
        pendingInvite._id,
      );
      // activeMemberCount should NOT be decremented
      expect(mockTeamModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
