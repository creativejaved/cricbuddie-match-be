import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

@Injectable()
export class ObjectIdValidationPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!isValidObjectId(value)) {
      const fieldName = metadata.data ? ` for '${metadata.data}'` : '';
      throw new BadRequestException(`Invalid ObjectId format${fieldName}`);
    }
    return value;
  }
}
