import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Adapters } from '@/adapters';
import { AuditService } from '@/shared/audit/AuditService';
import { AppConfig } from '@/config/env';
import { User } from '@/modules/account/types';
import { CreateStaffInput, UpdateStaffInput, StaffMember } from '@/modules/staff/types';

function toStaffMember(user: User): StaffMember {
  const { passwordHash: _, ...rest } = user;
  return rest as StaffMember;
}

export const StaffService = {
  async listByStore(storeId: string): Promise<StaffMember[]> {
    const users = await Adapters.staff.findByStoreId(storeId);
    return users.map(toStaffMember);
  },

  async getById(id: string): Promise<StaffMember | null> {
    const user = await Adapters.staff.findById(id);
    return user ? toStaffMember(user) : null;
  },

  async create(input: CreateStaffInput, actorId: string): Promise<StaffMember> {
    // Prevent creating another OWNER
    if (input.role === 'OWNER') {
      throw new Error('Cannot create another OWNER account. Only one owner per store.');
    }
    const existing = await Adapters.user.findByEmail(input.email);
    if (existing) throw new Error('A user with this email already exists.');

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(input.password, AppConfig.auth.bcryptRounds);
    const user = await Adapters.staff.create({ ...input, id, passwordHash });
    AuditService.log('staff.create', actorId, input.storeId, { role: input.role, email: input.email });
    return toStaffMember(user);
  },

  async update(id: string, updates: UpdateStaffInput, actorId: string, storeId: string): Promise<StaffMember> {
    if (updates.role === 'OWNER') {
      throw new Error('Cannot assign OWNER role to a staff member.');
    }
    const user = await Adapters.staff.update(id, updates);
    AuditService.log('staff.update', actorId, storeId, { targetId: id });
    return toStaffMember(user);
  },

  async deactivate(id: string, actorId: string, storeId: string): Promise<void> {
    await Adapters.staff.deactivate(id);
    AuditService.log('staff.deactivate', actorId, storeId, { targetId: id });
  },

  async reactivate(id: string, actorId: string, storeId: string): Promise<void> {
    await Adapters.staff.reactivate(id);
    AuditService.log('staff.reactivate', actorId, storeId, { targetId: id });
  },

  /** Get active sessions for a user (stub — returns sessions from adapter). */
  async getActiveSessions(userId: string) {
    const now = new Date().toISOString();
    return Adapters.session.findActive(userId, now);
  },
};
