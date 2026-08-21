import { Session, DeviceInfo } from '@/modules/account/types';

/**
 * ISessionRepository — contract for all Session persistence operations.
 */
export interface ISessionRepository {
  create(input: { id: string; userId: string; expiresAt: string; deviceInfo: DeviceInfo }): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  findActive(userId: string, now: string): Promise<Session[]>;
  invalidate(sessionId: string): Promise<void>;
  invalidateAll(userId: string): Promise<void>;
  purgeExpired(now: string): Promise<void>;
}
