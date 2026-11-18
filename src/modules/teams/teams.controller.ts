import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { QueryTeamMembersDto } from './dto/query-team-members.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ObjectIdValidationPipe } from '../../common/pipes/object-id-validation.pipe';

@ApiTags('Teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  /**
   * 1. Create a new team (creator becomes OWNER with ACTIVE status)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new cricket team' })
  @ApiResponse({ status: 201, description: 'Team created successfully' })
  createTeam(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.createTeam(userId, dto);
  }

  /**
   * 2. Get active teams and pending invitations for the authenticated user
   */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get active teams and pending invitations for the logged-in user',
  })
  getMyTeams(@CurrentUser('userId') userId: string) {
    return this.teamsService.getMyTeams(userId);
  }

  /**
   * 3. Public preview for Team Invite via QR Code / Join URL
   */
  @Get('invite/:inviteCode')
  @ApiOperation({
    summary: 'Public preview of a team by invite code (QR/URL landing screen)',
  })
  @ApiParam({ name: 'inviteCode', example: 'CB7K9X' })
  getInvitePreview(@Param('inviteCode') inviteCode: string) {
    return this.teamsService.getInvitePreview(inviteCode);
  }

  /**
   * 4. Join team via Invite Code / QR link
   */
  @Post('invite/:inviteCode/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Join a team using an invite code' })
  @ApiParam({ name: 'inviteCode', example: 'CB7K9X' })
  joinViaInviteCode(
    @Param('inviteCode') inviteCode: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.teamsService.joinViaInviteCode(inviteCode, userId);
  }

  /**
   * 5. Accept or Reject a team invitation (Target Player only)
   */
  @Patch('invitations/:membershipId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Accept or reject a direct team invitation' })
  @ApiParam({ name: 'membershipId', example: '672000000000000000000002' })
  respondToInvitation(
    @Param('membershipId', ObjectIdValidationPipe) membershipId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: RespondInvitationDto,
  ) {
    return this.teamsService.respondToInvitation(membershipId, userId, dto);
  }

  /**
   * 6. Get paginated squad members filtered by status (ACTIVE, PENDING_PLAYER, PENDING_ADMIN)
   */
  @Get(':teamId/members')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get paginated squad members filtered by status (ACTIVE, PENDING_PLAYER, PENDING_ADMIN)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  getTeamMembers(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @Query() query: QueryTeamMembersDto,
    @CurrentUser('userId') requesterUserId?: string,
  ) {
    return this.teamsService.getTeamMembers(teamId, query, requesterUserId);
  }

  /**
   * 7. Get team details, active squad, invite URL, and requester's membership
   * Includes rosterCounts for Owner / Admin
   */
  @Get(':teamId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get team profile, active squad, invite link, viewer membership, and rosterCounts (Public / Optional Auth)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  getTeam(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @CurrentUser('userId') currentUserId?: string,
  ) {
    return this.teamsService.getTeamById(teamId, currentUserId);
  }

  /**
   * 8. Update team details and squad roles (Owner / Admin only)
   */
  @Patch(':teamId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Update team details, join policy, invite status, and assign roles (Owner/Admin only)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  updateTeam(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.updateTeam(teamId, userId, dto);
  }

  /**
   * 9. Update specific member role (Owner / Admin only)
   */
  @Patch(':teamId/members/:membershipId/role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update squad member role (Owner/Admin only, cannot assign OWNER)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  @ApiParam({
    name: 'membershipId',
    example: '672000000000000000000002',
    description: 'Membership ID or User ID of target member',
  })
  updateMemberRole(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @Param('membershipId', ObjectIdValidationPipe) membershipId: string,
    @CurrentUser('userId') requesterUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.teamsService.updateMemberRole(
      teamId,
      membershipId,
      requesterUserId,
      dto,
    );
  }

  /**
   * 10. Rotate / Regenerate team invite code (Owner / Admin only)
   */
  @Post(':teamId/invite-code/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Rotate and regenerate the team invite code (Owner/Admin only)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  regenerateInviteCode(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.teamsService.regenerateInviteCode(teamId, userId);
  }

  /**
   * 11. Add or invite a member to the squad (Owner / Admin only)
   * Respects target user's allowDirectTeamAdd preference
   */
  @Post(':teamId/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Add player directly (if allowDirectTeamAdd=true) or send invitation (Owner/Admin only)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  addMember(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @CurrentUser('userId') requesterUserId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.teamsService.addMember(teamId, requesterUserId, dto);
  }

  /**
   * 12. List pending join requests (Owner / Admin only)
   */
  @Get(':teamId/requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List pending admin join requests (Owner/Admin only)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  getJoinRequests(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.teamsService.getJoinRequests(teamId, userId);
  }

  /**
   * 13. Approve or Reject a join request (Owner / Admin only)
   */
  @Patch(':teamId/requests/:membershipId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Approve or reject a pending join request (Owner/Admin only)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  @ApiParam({ name: 'membershipId', example: '672000000000000000000003' })
  respondToJoinRequest(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @Param('membershipId', ObjectIdValidationPipe) membershipId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: RespondRequestDto,
  ) {
    return this.teamsService.respondToJoinRequest(
      teamId,
      membershipId,
      userId,
      dto,
    );
  }

  /**
   * 14. Remove member, cancel invite, or leave team (Owner/Admin or Self)
   * Supports resolving target by membershipId with fallback to userId.
   */
  @Delete(':teamId/members/:membershipId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Remove member, cancel invite, or leave team (Owner/Admin or Self)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  @ApiParam({
    name: 'membershipId',
    example: '672000000000000000000002',
    description: 'Membership ID or User ID of target member',
  })
  removeMemberOrLeave(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @Param('membershipId', ObjectIdValidationPipe) membershipId: string,
    @CurrentUser('userId') requesterUserId: string,
  ) {
    return this.teamsService.removeMemberOrLeave(
      teamId,
      membershipId,
      requesterUserId,
    );
  }
}
