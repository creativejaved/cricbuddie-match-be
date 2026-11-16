import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Team, TeamDocument, TeamJoinPolicy } from '../../schemas/team.schema';
import {
  MembershipSource,
  MembershipStatus,
  SquadRole,
  TeamMember,
  TeamMemberDocument,
} from '../../schemas/team-member.schema';
import { IdentityClientService } from '../identity-client/identity-client.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddMemberDto } from './dto/add-member.dto';
import {
  InvitationAction,
  RespondInvitationDto,
} from './dto/respond-invitation.dto';
import { RequestAction, RespondRequestDto } from './dto/respond-request.dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);
  private readonly webAppUrl: string;

  constructor(
    @InjectModel(Team.name)
    private readonly teamModel: Model<TeamDocument>,
    @InjectModel(TeamMember.name)
    private readonly teamMemberModel: Model<TeamMemberDocument>,
    private readonly identityClientService: IdentityClientService,
    private readonly configService: ConfigService,
  ) {
    this.webAppUrl =
      this.configService.get<string>('WEB_APP_URL') || 'http://localhost:5173';
  }

  /**
   * Helper to build public invite URL
   */
  public buildInviteUrl(inviteCode: string): string {
    return `${this.webAppUrl}/teams/join/${inviteCode}`;
  }

  /**
   * Generate an uppercase alphanumeric 6-character unique invite code
   */
  private async generateUniqueInviteCode(): Promise<string> {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.teamModel
        .findOne({ inviteCode: code })
        .lean();
      if (!existing) {
        return code;
      }
    }
    // Fallback if collision persists
    return `CB${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  /**
   * Check if user is either the Owner or in adminIds of the team
   */
  private isOwnerOrAdmin(
    team: TeamDocument,
    userId: string,
  ): {
    isOwner: boolean;
    isAdmin: boolean;
    isAuthorized: boolean;
  } {
    const isOwner = team.ownerId.toString() === userId;
    const isAdmin =
      team.adminIds?.some((adminId) => adminId.toString() === userId) || false;
    return {
      isOwner,
      isAdmin,
      isAuthorized: isOwner || isAdmin,
    };
  }

  /**
   * 1. Create Team and auto-add creator as OWNER with ACTIVE membership
   */
  async createTeam(userId: string, dto: CreateTeamDto) {
    const ownerObjectId = new Types.ObjectId(userId);

    // Fetch creator's snapshot from Identity service
    const userSnapshot =
      await this.identityClientService.getUserSnapshot(userId);

    const inviteCode = await this.generateUniqueInviteCode();

    const team = new this.teamModel({
      name: dto.name.trim(),
      shortName: dto.shortName.trim().toUpperCase(),
      city: dto.city ? dto.city.trim() : null,
      logoUrl: dto.logoUrl || null,
      ownerId: ownerObjectId,
      adminIds: [ownerObjectId],
      joinPolicy: dto.joinPolicy || TeamJoinPolicy.APPROVAL,
      inviteCode,
      isInviteActive: true,
      activeMemberCount: 1,
      isActive: true,
    });

    await team.save();

    const ownerMember = new this.teamMemberModel({
      teamId: team._id,
      userId: ownerObjectId,
      playerSnapshot: {
        userId: ownerObjectId,
        fullName: userSnapshot.fullName,
        username: userSnapshot.username,
        playerRole: userSnapshot.playerRole,
        jerseyNumber: userSnapshot.jerseyNumber,
        avatarUrl: userSnapshot.avatarUrl,
      },
      status: MembershipStatus.ACTIVE,
      squadRole: SquadRole.OWNER,
      source: MembershipSource.ADMIN_ADD,
      joinedAt: new Date(),
    });

    await ownerMember.save();

    const teamObj = team.toObject();
    return {
      team: Object.assign(teamObj, {
        inviteUrl: this.buildInviteUrl(team.inviteCode),
      }),
      membership: ownerMember,
    };
  }

  /**
   * 2. Get active teams and pending player invites for the authenticated user
   */
  async getMyTeams(userId: string) {
    const userObjectId = new Types.ObjectId(userId);

    const memberships = await this.teamMemberModel
      .find({
        userId: userObjectId,
        status: {
          $in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING_PLAYER],
        },
      })
      .populate('teamId')
      .lean();

    const activeTeams: Array<Record<string, any>> = [];
    const pendingInvites: Array<Record<string, any>> = [];

    for (const membership of memberships) {
      const team = membership.teamId as unknown as TeamDocument;
      if (!team || team.isActive === false) {
        continue;
      }

      const item = {
        membershipId: membership._id,
        squadRole: membership.squadRole,
        status: membership.status,
        joinedAt: membership.joinedAt,
        source: membership.source,
        invitedBy: membership.invitedBy,
        team: {
          id: team._id,
          name: team.name,
          shortName: team.shortName,
          city: team.city,
          logoUrl: team.logoUrl,
          activeMemberCount: team.activeMemberCount,
          joinPolicy: team.joinPolicy,
          inviteUrl: this.buildInviteUrl(team.inviteCode),
          stats: team.stats,
        },
      };

      if (membership.status === MembershipStatus.ACTIVE) {
        activeTeams.push(item);
      } else {
        pendingInvites.push(item);
      }
    }

    return {
      activeTeams,
      pendingInvites,
    };
  }

  /**
   * 3. Get team details, active squad, invite URL, and requester's membership
   */
  async getTeamById(teamId: string, currentUserId?: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new BadRequestException('Invalid team ID format');
    }

    const team = await this.teamModel
      .findOne({ _id: new Types.ObjectId(teamId), isActive: true })
      .lean();

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const activeMembers = await this.teamMemberModel
      .find({
        teamId: team._id,
        status: MembershipStatus.ACTIVE,
      })
      .lean();

    let myMembership: Record<string, any> | null = null;
    if (currentUserId && Types.ObjectId.isValid(currentUserId)) {
      const foundMembership = await this.teamMemberModel
        .findOne({
          teamId: team._id,
          userId: new Types.ObjectId(currentUserId),
        })
        .lean();

      if (foundMembership) {
        myMembership = {
          id: foundMembership._id,
          status: foundMembership.status,
          squadRole: foundMembership.squadRole,
          joinedAt: foundMembership.joinedAt,
        };
      }
    }

    return Object.assign({}, team, {
      inviteUrl: this.buildInviteUrl(team.inviteCode),
      members: activeMembers,
      myMembership,
    });
  }

  /**
   * 4. Update team details and squad roles (Owner / Admin only)
   */
  async updateTeam(teamId: string, userId: string, dto: UpdateTeamDto) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new BadRequestException('Invalid team ID format');
    }

    const team = await this.teamModel.findOne({
      _id: new Types.ObjectId(teamId),
      isActive: true,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const { isOwner, isAuthorized } = this.isOwnerOrAdmin(team, userId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only team owner or administrators can modify team details',
      );
    }

    // Update basic team information
    if (dto.name !== undefined) team.name = dto.name.trim();
    if (dto.shortName !== undefined)
      team.shortName = dto.shortName.trim().toUpperCase();
    if (dto.city !== undefined) team.city = dto.city ? dto.city.trim() : null;
    if (dto.logoUrl !== undefined) team.logoUrl = dto.logoUrl;
    if (dto.joinPolicy !== undefined) team.joinPolicy = dto.joinPolicy;
    if (dto.isInviteActive !== undefined)
      team.isInviteActive = dto.isInviteActive;

    // Handle captain reassignment
    if (dto.captainUserId) {
      const captainObjectId = new Types.ObjectId(dto.captainUserId);
      const member = await this.teamMemberModel.findOne({
        teamId: team._id,
        userId: captainObjectId,
        status: MembershipStatus.ACTIVE,
      });

      if (!member) {
        throw new BadRequestException(
          'Target captain must be an active squad member',
        );
      }

      // Demote current captain (if not owner)
      await this.teamMemberModel.updateMany(
        {
          teamId: team._id,
          squadRole: SquadRole.CAPTAIN,
          userId: { $ne: team.ownerId },
        },
        { $set: { squadRole: SquadRole.PLAYER } },
      );

      // Only update squadRole if member is not owner
      if (member.squadRole !== SquadRole.OWNER) {
        member.squadRole = SquadRole.CAPTAIN;
        await member.save();
      }
    }

    // Handle vice-captain reassignment
    if (dto.viceCaptainUserId) {
      const vcObjectId = new Types.ObjectId(dto.viceCaptainUserId);
      const member = await this.teamMemberModel.findOne({
        teamId: team._id,
        userId: vcObjectId,
        status: MembershipStatus.ACTIVE,
      });

      if (!member) {
        throw new BadRequestException(
          'Target vice-captain must be an active squad member',
        );
      }

      // Demote current vice-captain
      await this.teamMemberModel.updateMany(
        {
          teamId: team._id,
          squadRole: SquadRole.VICE_CAPTAIN,
        },
        { $set: { squadRole: SquadRole.PLAYER } },
      );

      if (member.squadRole !== SquadRole.OWNER) {
        member.squadRole = SquadRole.VICE_CAPTAIN;
        await member.save();
      }
    }

    // Handle admin promotion
    if (dto.addAdminUserIds && dto.addAdminUserIds.length > 0) {
      for (const adminIdStr of dto.addAdminUserIds) {
        const adminObjectId = new Types.ObjectId(adminIdStr);
        const member = await this.teamMemberModel.findOne({
          teamId: team._id,
          userId: adminObjectId,
          status: MembershipStatus.ACTIVE,
        });

        if (member) {
          if (!team.adminIds.some((id) => id.equals(adminObjectId))) {
            team.adminIds.push(adminObjectId);
          }
          if (member.squadRole === SquadRole.PLAYER) {
            member.squadRole = SquadRole.ADMIN;
            await member.save();
          }
        }
      }
    }

    // Handle admin demotion (only owner can demote admins)
    if (dto.removeAdminUserIds && dto.removeAdminUserIds.length > 0) {
      if (!isOwner) {
        throw new ForbiddenException(
          'Only team owner can revoke administrator privileges',
        );
      }

      const removeIds = dto.removeAdminUserIds.map(
        (id) => new Types.ObjectId(id),
      );
      team.adminIds = team.adminIds.filter(
        (id) =>
          !removeIds.some((rm) => rm.equals(id)) || id.equals(team.ownerId),
      );

      for (const rmId of removeIds) {
        if (!rmId.equals(team.ownerId)) {
          await this.teamMemberModel.updateOne(
            {
              teamId: team._id,
              userId: rmId,
              squadRole: SquadRole.ADMIN,
            },
            { $set: { squadRole: SquadRole.PLAYER } },
          );
        }
      }
    }

    await team.save();

    return Object.assign(team.toObject(), {
      inviteUrl: this.buildInviteUrl(team.inviteCode),
    });
  }

  /**
   * 5. Regenerate invite code (Owner / Admin only)
   */
  async regenerateInviteCode(teamId: string, userId: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new BadRequestException('Invalid team ID format');
    }

    const team = await this.teamModel.findOne({
      _id: new Types.ObjectId(teamId),
      isActive: true,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const { isAuthorized } = this.isOwnerOrAdmin(team, userId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only team owner or administrators can regenerate invite codes',
      );
    }

    const newCode = await this.generateUniqueInviteCode();
    team.inviteCode = newCode;
    await team.save();

    return {
      inviteCode: team.inviteCode,
      inviteUrl: this.buildInviteUrl(team.inviteCode),
    };
  }

  /**
   * 6. Add member directly or invite (Owner / Admin only)
   * Respects allowDirectTeamAdd preference from Identity Service
   */
  async addMember(teamId: string, requesterUserId: string, dto: AddMemberDto) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new BadRequestException('Invalid team ID format');
    }

    const team = await this.teamModel.findOne({
      _id: new Types.ObjectId(teamId),
      isActive: true,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const { isAuthorized } = this.isOwnerOrAdmin(team, requesterUserId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only team owner or administrators can add members',
      );
    }

    const targetObjectId = new Types.ObjectId(dto.targetUserId);

    // Check existing membership
    const existing = await this.teamMemberModel.findOne({
      teamId: team._id,
      userId: targetObjectId,
    });

    if (existing) {
      if (existing.status === MembershipStatus.ACTIVE) {
        throw new ConflictException(
          'User is already an active member of this team',
        );
      }
      if (existing.status === MembershipStatus.PENDING_PLAYER) {
        throw new ConflictException(
          'An invitation is already pending player acceptance',
        );
      }
      if (existing.status === MembershipStatus.PENDING_ADMIN) {
        throw new BadRequestException(
          'User already has a pending join request. Please approve the request instead.',
        );
      }
    }

    // Fetch target user's snapshot and direct add preference
    const snapshot = await this.identityClientService.getUserSnapshot(
      dto.targetUserId,
    );

    const targetRole = dto.squadRole || SquadRole.PLAYER;
    const isDirectAdd = snapshot.allowDirectTeamAdd === true;

    const newStatus = isDirectAdd
      ? MembershipStatus.ACTIVE
      : MembershipStatus.PENDING_PLAYER;

    const joinedAt = isDirectAdd ? new Date() : null;

    let member: TeamMemberDocument;
    if (existing) {
      // Re-activate or update previously rejected/removed member
      existing.playerSnapshot = {
        userId: targetObjectId,
        fullName: snapshot.fullName,
        username: snapshot.username,
        playerRole: snapshot.playerRole,
        jerseyNumber: snapshot.jerseyNumber,
        avatarUrl: snapshot.avatarUrl,
      };
      existing.status = newStatus;
      existing.squadRole = targetRole;
      existing.source = MembershipSource.ADMIN_ADD;
      existing.invitedBy = new Types.ObjectId(requesterUserId);
      existing.joinedAt = joinedAt;
      member = await existing.save();
    } else {
      member = new this.teamMemberModel({
        teamId: team._id,
        userId: targetObjectId,
        playerSnapshot: {
          userId: targetObjectId,
          fullName: snapshot.fullName,
          username: snapshot.username,
          playerRole: snapshot.playerRole,
          jerseyNumber: snapshot.jerseyNumber,
          avatarUrl: snapshot.avatarUrl,
        },
        status: newStatus,
        squadRole: targetRole,
        source: MembershipSource.ADMIN_ADD,
        invitedBy: new Types.ObjectId(requesterUserId),
        joinedAt,
      });
      await member.save();
    }

    if (isDirectAdd) {
      await this.teamModel.findByIdAndUpdate(team._id, {
        $inc: { activeMemberCount: 1 },
      });
    }

    return member;
  }

  /**
   * 7. Respond to pending invitation (Target Player only)
   */
  async respondToInvitation(
    membershipId: string,
    userId: string,
    dto: RespondInvitationDto,
  ) {
    if (!Types.ObjectId.isValid(membershipId)) {
      throw new BadRequestException('Invalid membership ID format');
    }

    const membership = await this.teamMemberModel.findById(membershipId);
    if (!membership) {
      throw new NotFoundException('Invitation not found');
    }

    if (membership.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You can only respond to invitations addressed to yourself',
      );
    }

    if (membership.status !== MembershipStatus.PENDING_PLAYER) {
      throw new BadRequestException(
        `Cannot respond to invitation with status: ${membership.status}`,
      );
    }

    if (dto.action === InvitationAction.ACCEPT) {
      membership.status = MembershipStatus.ACTIVE;
      membership.joinedAt = new Date();
      await membership.save();

      await this.teamModel.findByIdAndUpdate(membership.teamId, {
        $inc: { activeMemberCount: 1 },
      });
    } else {
      membership.status = MembershipStatus.REJECTED;
      await membership.save();
    }

    return membership;
  }

  /**
   * 8. Public Team Invite Preview for QR / URL landing page
   */
  async getInvitePreview(inviteCode: string) {
    const team = await this.teamModel
      .findOne({
        inviteCode: inviteCode.trim(),
        isActive: true,
      })
      .lean();

    if (!team) {
      throw new NotFoundException('Invalid or expired team invite code');
    }

    return {
      teamId: team._id,
      name: team.name,
      shortName: team.shortName,
      city: team.city,
      logoUrl: team.logoUrl,
      activeMemberCount: team.activeMemberCount,
      joinPolicy: team.joinPolicy,
      isInviteActive: team.isInviteActive,
    };
  }

  /**
   * 9. Join via Invite Code / QR (JWT Required)
   */
  async joinViaInviteCode(inviteCode: string, userId: string) {
    const team = await this.teamModel.findOne({
      inviteCode: inviteCode.trim(),
      isActive: true,
    });

    if (!team) {
      throw new NotFoundException('Invalid or expired team invite code');
    }

    if (!team.isInviteActive) {
      throw new ForbiddenException('Team invite link is currently inactive');
    }

    if (team.joinPolicy === TeamJoinPolicy.INVITE_ONLY) {
      throw new ForbiddenException(
        'This team is invite-only and cannot be joined via invite link',
      );
    }

    const userObjectId = new Types.ObjectId(userId);

    const existing = await this.teamMemberModel.findOne({
      teamId: team._id,
      userId: userObjectId,
    });

    if (existing) {
      if (existing.status === MembershipStatus.ACTIVE) {
        throw new ConflictException(
          'You are already an active member of this team',
        );
      }
      if (existing.status === MembershipStatus.PENDING_ADMIN) {
        throw new ConflictException(
          'Your join request is already pending administrator approval',
        );
      }
    }

    // Fetch joining user's snapshot
    const snapshot = await this.identityClientService.getUserSnapshot(userId);

    const isAutoAccept =
      team.joinPolicy === TeamJoinPolicy.OPEN ||
      existing?.status === MembershipStatus.PENDING_PLAYER;

    const newStatus = isAutoAccept
      ? MembershipStatus.ACTIVE
      : MembershipStatus.PENDING_ADMIN;

    const joinedAt = isAutoAccept ? new Date() : null;

    let member: TeamMemberDocument;
    if (existing) {
      existing.playerSnapshot = {
        userId: userObjectId,
        fullName: snapshot.fullName,
        username: snapshot.username,
        playerRole: snapshot.playerRole,
        jerseyNumber: snapshot.jerseyNumber,
        avatarUrl: snapshot.avatarUrl,
      };
      existing.status = newStatus;
      existing.source = MembershipSource.INVITE_LINK;
      existing.joinedAt = joinedAt;
      member = await existing.save();
    } else {
      member = new this.teamMemberModel({
        teamId: team._id,
        userId: userObjectId,
        playerSnapshot: {
          userId: userObjectId,
          fullName: snapshot.fullName,
          username: snapshot.username,
          playerRole: snapshot.playerRole,
          jerseyNumber: snapshot.jerseyNumber,
          avatarUrl: snapshot.avatarUrl,
        },
        status: newStatus,
        squadRole: SquadRole.PLAYER,
        source: MembershipSource.INVITE_LINK,
        joinedAt,
      });
      await member.save();
    }

    if (isAutoAccept) {
      await this.teamModel.findByIdAndUpdate(team._id, {
        $inc: { activeMemberCount: 1 },
      });
    }

    return {
      message:
        newStatus === MembershipStatus.ACTIVE
          ? 'Successfully joined team'
          : 'Join request submitted for admin approval',
      membership: member,
    };
  }

  /**
   * 10. List PENDING_ADMIN join requests (Owner / Admin only)
   */
  async getJoinRequests(teamId: string, userId: string) {
    if (!Types.ObjectId.isValid(teamId)) {
      throw new BadRequestException('Invalid team ID format');
    }

    const team = await this.teamModel.findOne({
      _id: new Types.ObjectId(teamId),
      isActive: true,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const { isAuthorized } = this.isOwnerOrAdmin(team, userId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only team owner or administrators can review join requests',
      );
    }

    return this.teamMemberModel
      .find({
        teamId: team._id,
        status: MembershipStatus.PENDING_ADMIN,
      })
      .lean();
  }

  /**
   * 11. Approve or Reject a join request (Owner / Admin only)
   */
  async respondToJoinRequest(
    teamId: string,
    membershipId: string,
    userId: string,
    dto: RespondRequestDto,
  ) {
    if (
      !Types.ObjectId.isValid(teamId) ||
      !Types.ObjectId.isValid(membershipId)
    ) {
      throw new BadRequestException('Invalid ID format');
    }

    const team = await this.teamModel.findOne({
      _id: new Types.ObjectId(teamId),
      isActive: true,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const { isAuthorized } = this.isOwnerOrAdmin(team, userId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only team owner or administrators can respond to join requests',
      );
    }

    const membership = await this.teamMemberModel.findOne({
      _id: new Types.ObjectId(membershipId),
      teamId: team._id,
    });

    if (!membership) {
      throw new NotFoundException('Join request not found');
    }

    if (membership.status !== MembershipStatus.PENDING_ADMIN) {
      throw new BadRequestException(
        `Cannot respond to join request with status: ${membership.status}`,
      );
    }

    if (dto.action === RequestAction.APPROVE) {
      membership.status = MembershipStatus.ACTIVE;
      membership.joinedAt = new Date();
      await membership.save();

      await this.teamModel.findByIdAndUpdate(team._id, {
        $inc: { activeMemberCount: 1 },
      });
    } else {
      membership.status = MembershipStatus.REJECTED;
      await membership.save();
    }

    return membership;
  }

  /**
   * 12. Remove member or leave team
   * Prevents Owner from leaving without transferring ownership
   */
  async removeMemberOrLeave(
    teamId: string,
    targetUserId: string,
    requesterUserId: string,
  ) {
    if (
      !Types.ObjectId.isValid(teamId) ||
      !Types.ObjectId.isValid(targetUserId)
    ) {
      throw new BadRequestException('Invalid ID format');
    }

    const team = await this.teamModel.findOne({
      _id: new Types.ObjectId(teamId),
      isActive: true,
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const isSelf = targetUserId === requesterUserId;
    const { isOwner: requesterIsOwner, isAdmin: requesterIsAdmin } =
      this.isOwnerOrAdmin(team, requesterUserId);

    if (!isSelf && !requesterIsOwner && !requesterIsAdmin) {
      throw new ForbiddenException(
        'You do not have permission to remove members from this team',
      );
    }

    const targetObjectId = new Types.ObjectId(targetUserId);

    const membership = await this.teamMemberModel.findOne({
      teamId: team._id,
      userId: targetObjectId,
      status: MembershipStatus.ACTIVE,
    });

    if (!membership) {
      throw new NotFoundException('Active squad member not found');
    }

    // Owner cannot leave without transferring ownership
    if (
      team.ownerId.equals(targetObjectId) ||
      membership.squadRole === SquadRole.OWNER
    ) {
      throw new BadRequestException(
        'Team owner cannot leave the team without transferring ownership first',
      );
    }

    // An admin cannot remove another admin or the owner
    if (!isSelf && !requesterIsOwner && requesterIsAdmin) {
      const targetIsAdmin =
        team.adminIds.some((id) => id.equals(targetObjectId)) ||
        membership.squadRole === SquadRole.ADMIN;
      if (targetIsAdmin) {
        throw new ForbiddenException(
          'Administrators cannot remove other administrators or the team owner',
        );
      }
    }

    // Set member status to REMOVED
    membership.status = MembershipStatus.REMOVED;
    await membership.save();

    // Remove from team.adminIds if present
    const updatedAdminIds = team.adminIds.filter(
      (id) => !id.equals(targetObjectId),
    );
    const newCount = Math.max(1, team.activeMemberCount - 1);

    await this.teamModel.findByIdAndUpdate(team._id, {
      $set: { adminIds: updatedAdminIds, activeMemberCount: newCount },
    });

    return {
      message: isSelf
        ? 'You have successfully left the team'
        : 'Member has been removed from the team',
    };
  }
}
