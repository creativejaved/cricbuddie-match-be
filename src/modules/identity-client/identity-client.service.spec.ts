import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { IdentityClientService } from './identity-client.service';
import { PlayerSnapshotDto } from './interfaces/player-snapshot.interface';

describe('IdentityClientService', () => {
  let service: IdentityClientService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityClientService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IdentityClientService>(IdentityClientService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserSnapshot', () => {
    it('should fetch and return player snapshot', async () => {
      const mockSnapshot: PlayerSnapshotDto = {
        userId: '672000000000000000000001',
        fullName: 'Virat Kohli',
        username: 'vkohli',
        playerRole: 'TOP_ORDER_BATTER',
        jerseyNumber: 18,
        avatarUrl: 'https://example.com/vk.jpg',
        allowDirectTeamAdd: true,
      };

      const axiosResponse: AxiosResponse = {
        data: mockSnapshot,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      const getSpy = jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of(axiosResponse));

      const result = await service.getUserSnapshot('672000000000000000000001');
      expect(result).toEqual(mockSnapshot);
      expect(getSpy).toHaveBeenCalledWith(
        '/internal/users/672000000000000000000001/snapshot',
      );
    });

    it('should throw NotFoundException if user not found (404)', async () => {
      const axiosError = new AxiosError('Not Found');
      axiosError.response = {
        status: 404,
        data: { message: 'User not found' },
        statusText: 'Not Found',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => axiosError));

      await expect(service.getUserSnapshot('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on network or 500 error', async () => {
      const axiosError = new AxiosError('Internal Error');
      axiosError.response = {
        status: 500,
        data: { message: 'Error' },
        statusText: 'Error',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => axiosError));

      await expect(service.getUserSnapshot('user123')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getBatchSnapshots', () => {
    it('should return empty record if userIds array is empty', async () => {
      const postSpy = jest.spyOn(httpService, 'post');
      const result = await service.getBatchSnapshots([]);
      expect(result).toEqual({});
      expect(postSpy).not.toHaveBeenCalled();
    });

    it('should fetch batch snapshots successfully', async () => {
      const mockSnapshots = {
        user1: {
          userId: 'user1',
          fullName: 'Player One',
          username: 'p1',
          playerRole: null,
          jerseyNumber: null,
          avatarUrl: null,
          allowDirectTeamAdd: false,
        },
      };

      const axiosResponse: AxiosResponse = {
        data: { snapshots: mockSnapshots },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(axiosResponse));

      const result = await service.getBatchSnapshots(['user1']);
      expect(result).toEqual(mockSnapshots);
      expect(postSpy).toHaveBeenCalledWith('/internal/users/snapshots', {
        userIds: ['user1'],
      });
    });
  });
});
