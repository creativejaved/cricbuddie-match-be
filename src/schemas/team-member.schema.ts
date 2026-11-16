import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  PlayerSnapshot,
  PlayerSnapshotSchema,
} from './common/player-snapshot.schema';

export type TeamMemberDocument = HydratedDocument<TeamMember>;

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  PENDING_PLAYER = 'PENDING_PLAYER',
  PENDING_ADMIN = 'PENDING_ADMIN',
  REJECTED = 'REJECTED',
  REMOVED = 'REMOVED',
}

export enum SquadRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  CAPTAIN = 'CAPTAIN',
  VICE_CAPTAIN = 'VICE_CAPTAIN',
  PLAYER = 'PLAYER',
}

export enum MembershipSource {
  ADMIN_ADD = 'ADMIN_ADD',
  INVITE_LINK = 'INVITE_LINK',
  QR_SCAN = 'QR_SCAN',
}

@Schema({ timestamps: true })
export class TeamMember {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Team',
    required: true,
    index: true,
  })
  teamId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: PlayerSnapshotSchema,
    required: true,
  })
  playerSnapshot: PlayerSnapshot;

  @Prop({
    type: String,
    enum: Object.values(MembershipStatus),
    required: true,
  })
  status: MembershipStatus;

  @Prop({
    type: String,
    enum: Object.values(SquadRole),
    default: SquadRole.PLAYER,
  })
  squadRole: SquadRole;

  @Prop({
    type: String,
    enum: Object.values(MembershipSource),
    default: MembershipSource.ADMIN_ADD,
  })
  source: MembershipSource;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    default: null,
  })
  invitedBy?: Types.ObjectId | null;

  @Prop({
    type: Date,
    default: null,
  })
  joinedAt?: Date | null;
}

export const TeamMemberSchema = SchemaFactory.createForClass(TeamMember);

// Compound unique index on teamId and userId
TeamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });

// Secondary index for user's active/pending teams query
TeamMemberSchema.index({ userId: 1, status: 1 });
