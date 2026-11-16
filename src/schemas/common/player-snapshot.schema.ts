import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class PlayerSnapshot {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String })
  fullName: string;

  @Prop({ type: String, default: null })
  username?: string | null;

  @Prop({ type: String, default: null })
  playerRole?: string | null;

  @Prop({ type: Number, default: null })
  jerseyNumber?: number | null;

  @Prop({ type: String, default: null })
  avatarUrl?: string | null;
}

export const PlayerSnapshotSchema =
  SchemaFactory.createForClass(PlayerSnapshot);
