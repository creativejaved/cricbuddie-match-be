import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  PlayerSnapshot,
  PlayerSnapshotSchema,
} from './common/player-snapshot.schema';

export type MatchDocument = HydratedDocument<Match>;

export enum MatchType {
  LIMITED_OVERS = 'LIMITED_OVERS',
  BOX_TURF = 'BOX_TURF',
  PAIR_CRICKET = 'PAIR_CRICKET',
  TEST_MATCH = 'TEST_MATCH',
  THE_HUNDRED = 'THE_HUNDRED',
}

// Backward compatibility alias for existing consumers
export const MatchFormat = MatchType;
export type MatchFormat = MatchType;

export enum PitchType {
  ROUGH = 'ROUGH',
  CEMENT = 'CEMENT',
  TURF = 'TURF',
  ASTROTURF = 'ASTROTURF',
  MATTING = 'MATTING',
}

export enum BallType {
  TENNIS = 'TENNIS',
  LEATHER = 'LEATHER',
  OTHER = 'OTHER',
}

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  TOSS = 'TOSS',
  LIVE = 'LIVE',
  INNINGS_BREAK = 'INNINGS_BREAK',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum TossDecision {
  BAT = 'BAT',
  BOWL = 'BOWL',
}

@Schema({ _id: false })
export class MatchTeamSlot {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  teamId: Types.ObjectId;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: String })
  shortName: string;

  @Prop({ type: String, default: null })
  logoUrl?: string | null;

  @Prop({ type: [PlayerSnapshotSchema], default: [] })
  playingXI: PlayerSnapshot[];

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  captainId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  wicketKeeperId?: Types.ObjectId | null;

  @Prop({ type: Number, default: 0 })
  runs: number;

  @Prop({ type: Number, default: 0 })
  wickets: number;

  @Prop({ type: String, default: '0.0' })
  oversText: string;
}

export const MatchTeamSlotSchema = SchemaFactory.createForClass(MatchTeamSlot);

@Schema({ _id: false })
export class MatchVenue {
  @Prop({ required: true, type: String })
  ground: string;

  @Prop({ type: String, default: null })
  groundName?: string | null;

  @Prop({ required: true, type: String })
  city: string;
}

export const MatchVenueSchema = SchemaFactory.createForClass(MatchVenue);

@Schema({ _id: false })
export class MatchOfficials {
  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId }], default: [] })
  scorerIds: Types.ObjectId[];

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  scorerId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  activeScorerId?: Types.ObjectId | null;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId }], default: [] })
  umpireIds: Types.ObjectId[];

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  matchRefereeId?: Types.ObjectId | null;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId }], default: [] })
  liveStreamerIds: Types.ObjectId[];

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  streamerId?: Types.ObjectId | null;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId }], default: [] })
  commentatorIds: Types.ObjectId[];
}

export const MatchOfficialsSchema =
  SchemaFactory.createForClass(MatchOfficials);

@Schema({ _id: false })
export class MatchToss {
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  wonByTeamId?: Types.ObjectId | null;

  @Prop({ type: String, enum: Object.values(TossDecision), default: null })
  decision?: TossDecision | null;
}

export const MatchTossSchema = SchemaFactory.createForClass(MatchToss);

@Schema({ _id: false })
export class MatchResult {
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  winnerTeamId?: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false })
  isTie: boolean;

  @Prop({ type: Boolean, default: false })
  isNoResult: boolean;

  @Prop({ type: String, default: null })
  marginText?: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  playerOfMatchId?: Types.ObjectId | null;
}

export const MatchResultSchema = SchemaFactory.createForClass(MatchResult);

@Schema({ timestamps: true })
export class Match {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    default: null,
    index: true,
  })
  tournamentId?: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: Object.values(MatchType),
    required: true,
    default: MatchType.LIMITED_OVERS,
  })
  matchType: MatchType;

  @Prop({
    type: String,
    enum: Object.values(MatchType),
    default: null,
  })
  matchFormat?: MatchType | null;

  @Prop({ type: Number, required: true, default: 6, min: 1 })
  ballsPerOver: number;

  @Prop({
    type: String,
    enum: Object.values(PitchType),
    default: PitchType.TURF,
  })
  pitchType: PitchType;

  @Prop({ type: Number, required: true, min: 1 })
  oversPerInnings: number;

  @Prop({
    type: String,
    enum: Object.values(BallType),
    default: BallType.LEATHER,
  })
  ballType: BallType;

  @Prop({ type: MatchVenueSchema, required: true })
  venue: MatchVenue;

  @Prop({ type: Date, required: true, index: true })
  scheduledAt: Date;

  @Prop({
    type: String,
    enum: Object.values(MatchStatus),
    default: MatchStatus.SCHEDULED,
    index: true,
  })
  status: MatchStatus;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  createdBy: Types.ObjectId;

  @Prop({ type: MatchTeamSlotSchema, required: true })
  teamA: MatchTeamSlot;

  @Prop({ type: MatchTeamSlotSchema, required: true })
  teamB: MatchTeamSlot;

  @Prop({ type: MatchOfficialsSchema, default: () => ({}) })
  officials: MatchOfficials;

  @Prop({ type: MatchTossSchema, default: () => ({}) })
  toss: MatchToss;

  @Prop({ type: Number, default: 1 })
  currentInningsNumber: number;

  @Prop({ type: MatchResultSchema, default: () => ({}) })
  result: MatchResult;

  @Prop({ type: Number, default: 0 })
  lastSyncedSequence: number;
}

export const MatchSchema = SchemaFactory.createForClass(Match);
