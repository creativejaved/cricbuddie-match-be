import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type TeamDocument = HydratedDocument<Team>;

export enum TeamJoinPolicy {
  OPEN = 'OPEN',
  APPROVAL = 'APPROVAL',
  INVITE_ONLY = 'INVITE_ONLY',
}

@Schema({ _id: false })
export class TeamStats {
  @Prop({ type: Number, default: 0 })
  matchesPlayed: number;

  @Prop({ type: Number, default: 0 })
  won: number;

  @Prop({ type: Number, default: 0 })
  lost: number;

  @Prop({ type: Number, default: 0 })
  tied: number;

  @Prop({ type: Number, default: 0 })
  noResult: number;
}

export const TeamStatsSchema = SchemaFactory.createForClass(TeamStats);

@Schema({ timestamps: true })
export class Team {
  @Prop({ required: true, trim: true, type: String })
  name: string;

  @Prop({
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 5,
    type: String,
  })
  shortName: string;

  @Prop({ type: String, default: null })
  logoUrl?: string | null;

  @Prop({ type: String, trim: true, default: null })
  city?: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId }],
    default: [],
  })
  adminIds: Types.ObjectId[];

  @Prop({
    type: String,
    enum: Object.values(TeamJoinPolicy),
    default: TeamJoinPolicy.APPROVAL,
  })
  joinPolicy: TeamJoinPolicy;

  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  inviteCode: string;

  @Prop({ type: Boolean, default: true })
  isInviteActive: boolean;

  @Prop({ type: Number, default: 1 })
  activeMemberCount: number;

  @Prop({ type: TeamStatsSchema, default: () => ({}) })
  stats: TeamStats;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;
}

export const TeamSchema = SchemaFactory.createForClass(Team);
