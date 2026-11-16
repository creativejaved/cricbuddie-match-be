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
   * 6. Get team details, active squad, invite URL, and requester's membership
   */
  @Get(':teamId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get team profile, active squad, invite link, and viewer membership (Public / Optional Auth)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  getTeam(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @CurrentUser('userId') currentUserId?: string,
  ) {
    return this.teamsService.getTeamById(teamId, currentUserId);
  }

  /**
   * 7. Update team details and squad roles (Owner / Admin only)
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
   * 8. Rotate / Regenerate team invite code (Owner / Admin only)
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
   * 9. Add or invite a member to the squad (Owner / Admin only)
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
   * 10. List pending join requests (Owner / Admin only)
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
   * 11. Approve or Reject a join request (Owner / Admin only)
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
   * 12. Remove member from squad or leave team (Owner/Admin or Self-leave)
   */
  @Delete(':teamId/members/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Remove member or leave team (Owner/Admin or Self-leave)',
  })
  @ApiParam({ name: 'teamId', example: '672000000000000000000001' })
  @ApiParam({ name: 'userId', example: '672000000000000000000004' })
  removeMemberOrLeave(
    @Param('teamId', ObjectIdValidationPipe) teamId: string,
    @Param('userId', ObjectIdValidationPipe) targetUserId: string,
    @CurrentUser('userId') requesterUserId: string,
  ) {
    return this.teamsService.removeMemberOrLeave(
      teamId,
      targetUserId,
      requesterUserId,
    );
  }
}
