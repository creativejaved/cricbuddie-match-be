import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtTokenPayload {
  sub?: string;
  userId?: string;
  email: string;
  username?: string;
  roles?: string[];
  deviceId?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  username: string | null;
  roles: string[];
  deviceId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'cricbuddie_jwt_access_secret_2026_dev',
    });
  }

  validate(payload: JwtTokenPayload): AuthenticatedUser {
    const userId = payload.sub || payload.userId;
    if (!userId) {
      throw new UnauthorizedException(
        'Invalid token payload: missing user identifier',
      );
    }

    return {
      userId,
      email: payload.email,
      username: payload.username || null,
      roles: payload.roles || [],
      deviceId: payload.deviceId,
    };
  }
}
