import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import {
  BatchSnapshotsResponse,
  PlayerSnapshotDto,
} from './interfaces/player-snapshot.interface';

@Injectable()
export class IdentityClientService {
  private readonly logger = new Logger(IdentityClientService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Fetch a single user's player snapshot and direct team add preference
   */
  async getUserSnapshot(userId: string): Promise<PlayerSnapshotDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PlayerSnapshotDto>(
          `/internal/users/${userId}/snapshot`,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new NotFoundException(
            `User ${userId} not found in identity service`,
          );
        }
        this.logger.error(
          `Failed to fetch user snapshot for ${userId}: ${error.response?.data?.message || error.message}`,
        );
      } else {
        this.logger.error(
          `Unexpected error fetching user snapshot for ${userId}`,
          error,
        );
      }
      throw new InternalServerErrorException(
        'Unable to communicate with CricBuddie Identity service',
      );
    }
  }

  /**
   * Fetch batch player snapshots for multiple user IDs in O(1)
   */
  async getBatchSnapshots(
    userIds: string[],
  ): Promise<Record<string, PlayerSnapshotDto>> {
    if (!userIds || userIds.length === 0) {
      return {};
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<BatchSnapshotsResponse>(
          '/internal/users/snapshots',
          {
            userIds,
          },
        ),
      );
      return response.data.snapshots;
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        this.logger.error(
          `Failed to fetch batch snapshots: ${error.response?.data?.message || error.message}`,
        );
      } else {
        this.logger.error(
          'Unexpected error fetching batch user snapshots',
          error,
        );
      }
      throw new InternalServerErrorException(
        'Unable to communicate with CricBuddie Identity service',
      );
    }
  }
}
