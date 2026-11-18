import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type InningDocument = HydratedDocument<Inning>;

@Schema({ _id: false })
export class BatterLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  playerId: Types.ObjectId;

  @Prop({ required: true, type: String })
  fullName: string;

  @Prop({ type: String, default: null })
  username?: string | null;

  @Prop({ type: Number, default: 0 })
  runs: number;

  @Prop({ type: Number, default: 0 })
  ballsFaced: number;

  @Prop({ type: Number, default: 0 })
  fours: number;

  @Prop({ type: Number, default: 0 })
  sixes: number;

  @Prop({ type: Boolean, default: false })
  isOut: boolean;

  @Prop({ type: String, default: 'not out' })
  dismissalText: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  bowlerId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  fielderId?: Types.ObjectId | null;
}

export const BatterLineSchema = SchemaFactory.createForClass(BatterLine);

@Schema({ _id: false })
export class BowlerLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  playerId: Types.ObjectId;

  @Prop({ required: true, type: String })
  fullName: string;

  @Prop({ type: String, default: null })
  username?: string | null;

  @Prop({ type: Number, default: 0 })
  legalBalls: number;

  @Prop({ type: Number, default: 0 })
  maidens: number;

  @Prop({ type: Number, default: 0 })
  runsConceded: number;

  @Prop({ type: Number, default: 0 })
  wickets: number;

  @Prop({ type: Number, default: 0 })
  wides: number;

  @Prop({ type: Number, default: 0 })
  noBalls: number;
}

export const BowlerLineSchema = SchemaFactory.createForClass(BowlerLine);

@Schema({ _id: false })
export class FallOfWicket {
  @Prop({ type: Number, required: true })
  wicketNumber: number;

  @Prop({ type: Number, required: true })
  score: number;

  @Prop({ type: String, required: true })
  overText: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  dismissedPlayerId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  ballSequence: number;
}

export const FallOfWicketSchema = SchemaFactory.createForClass(FallOfWicket);

@Schema({ _id: false })
export class InningExtras {
  @Prop({ type: Number, default: 0 })
  wides: number;

  @Prop({ type: Number, default: 0 })
  noBalls: number;

  @Prop({ type: Number, default: 0 })
  byes: number;

  @Prop({ type: Number, default: 0 })
  legByes: number;

  @Prop({ type: Number, default: 0 })
  penalty: number;
}

export const InningExtrasSchema = SchemaFactory.createForClass(InningExtras);

@Schema({ _id: false })
export class InningCurrentState {
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  strikerId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  nonStrikerId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  currentBowlerId?: Types.ObjectId | null;

  @Prop({ type: Number, default: 1 })
  currentOverNumber: number;
}

export const InningCurrentStateSchema =
  SchemaFactory.createForClass(InningCurrentState);

@Schema({ timestamps: true })
export class Inning {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true,
  })
  matchId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  inningsNumber: number;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Team',
    required: true,
  })
  battingTeamId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Team',
    required: true,
  })
  bowlingTeamId: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isCompleted: boolean;

  @Prop({ type: Number, default: 0 })
  totalRuns: number;

  @Prop({ type: Number, default: 0 })
  totalWickets: number;

  @Prop({ type: Number, default: 0 })
  legalBallsBowled: number;

  @Prop({ type: Number, default: null })
  targetRuns?: number | null;

  @Prop({ type: InningExtrasSchema, default: () => ({}) })
  extras: InningExtras;

  @Prop({
    type: InningCurrentStateSchema,
    default: () => ({ currentOverNumber: 1 }),
  })
  currentState: InningCurrentState;

  @Prop({ type: [BatterLineSchema], default: [] })
  battingCard: BatterLine[];

  @Prop({ type: [BowlerLineSchema], default: [] })
  bowlingCard: BowlerLine[];

  @Prop({ type: [FallOfWicketSchema], default: [] })
  fallOfWickets: FallOfWicket[];
}

export const InningSchema = SchemaFactory.createForClass(Inning);

// Unique compound index on matchId and inningsNumber
InningSchema.index({ matchId: 1, inningsNumber: 1 }, { unique: true });
