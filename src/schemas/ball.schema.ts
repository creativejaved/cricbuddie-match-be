import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type BallDocument = HydratedDocument<Ball>;

export enum ExtraType {
  NONE = 'NONE',
  WIDE = 'WIDE',
  NO_BALL = 'NO_BALL',
  BYE = 'BYE',
  LEG_BYE = 'LEG_BYE',
  PENALTY = 'PENALTY',
}

export enum DismissalType {
  BOWLED = 'BOWLED',
  CAUGHT = 'CAUGHT',
  LBW = 'LBW',
  RUN_OUT = 'RUN_OUT',
  STUMPED = 'STUMPED',
  HIT_WICKET = 'HIT_WICKET',
  RETIRED_HURT = 'RETIRED_HURT',
}

@Schema({ _id: false })
export class BallWicket {
  @Prop({ type: Boolean, default: false })
  isWicket: boolean;

  @Prop({ type: String, enum: Object.values(DismissalType), default: null })
  dismissalType?: DismissalType | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  dismissedPlayerId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  fielderId?: Types.ObjectId | null;
}

export const BallWicketSchema = SchemaFactory.createForClass(BallWicket);

@Schema({ timestamps: true })
export class Ball {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true,
  })
  matchId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  inningsNumber: number;

  @Prop({ type: String, required: true })
  clientEventId: string;

  @Prop({ type: Number, required: true })
  sequenceNumber: number;

  @Prop({ type: Number, required: true })
  overNumber: number;

  @Prop({ type: Number, required: true })
  legalBallInOver: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  bowlerId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  strikerId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  nonStrikerId: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0, max: 7 })
  runsOffBat: number;

  @Prop({
    type: String,
    enum: Object.values(ExtraType),
    default: ExtraType.NONE,
  })
  extraType: ExtraType;

  @Prop({ type: Number, default: 0, min: 0 })
  extraRuns: number;

  @Prop({ type: Boolean, required: true })
  isLegalDelivery: boolean;

  @Prop({ type: Boolean, default: false })
  isBoundaryFour: boolean;

  @Prop({ type: Boolean, default: false })
  isBoundarySix: boolean;

  @Prop({ type: BallWicketSchema, default: () => ({ isWicket: false }) })
  wicket: BallWicket;

  @Prop({ type: Boolean, default: false })
  isUndone: boolean;

  @Prop({ type: Date, required: true })
  recordedAt: Date;
}

export const BallSchema = SchemaFactory.createForClass(Ball);

// Unique compound index on matchId and clientEventId (idempotent deduplication for mobile sync)
BallSchema.index({ matchId: 1, clientEventId: 1 }, { unique: true });

// Unique compound index on matchId, inningsNumber and sequenceNumber
BallSchema.index(
  { matchId: 1, inningsNumber: 1, sequenceNumber: 1 },
  { unique: true },
);

// Compound query index for fast state recomputation
BallSchema.index({
  matchId: 1,
  inningsNumber: 1,
  sequenceNumber: 1,
  isUndone: 1,
});
