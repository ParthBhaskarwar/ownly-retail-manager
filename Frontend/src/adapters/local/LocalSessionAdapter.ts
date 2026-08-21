import { Session, DeviceInfo } from '@/modules/account/types';
import { ISessionRepository } from '@/modules/account/repository/ISessionRepository';

const STORAGE_KEY = 'ownly:sessions';

function readAll(): Session[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Session[];
  } catch {
    return [];
  }
}

function writeAll(sessions: Session[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export class LocalSessionAdapter implements ISessionRepository {
  async create(input: {
    id: string;
    userId: string;
    expiresAt: string;
    deviceInfo: DeviceInfo;
  }): Promise<Session> {
    const all = readAll();
    const session: Session = {
      id: input.id,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      deviceInfo: input.deviceInfo,
    };
    writeAll([...all, session]);
    return session;
  }

  async findById(id: string): Promise<Session | null> {
    return readAll().find((s) => s.id === id) ?? null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    return readAll().filter((s) => s.userId === userId);
  }

  async findActive(userId: string, now: string): Promise<Session[]> {
    const nowMs = new Date(now).getTime();
    return readAll().filter(
      (s) => s.userId === userId && new Date(s.expiresAt).getTime() > nowMs
    );
  }

  async invalidate(sessionId: string): Promise<void> {
    writeAll(readAll().filter((s) => s.id !== sessionId));
  }

  async invalidateAll(userId: string): Promise<void> {
    writeAll(readAll().filter((s) => s.userId !== userId));
  }

  async purgeExpired(now: string): Promise<void> {
    const nowMs = new Date(now).getTime();
    writeAll(readAll().filter((s) => new Date(s.expiresAt).getTime() > nowMs));
  }
}
