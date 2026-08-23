/**
 * StaffService — talks to the backend staff API.
 *
 * Password hashing moved to the server; bcrypt no longer runs in the browser.
 * Signatures are unchanged so StaffList, StaffForm and the staff pages work
 * without modification.
 */

import { apiClient } from '@/lib/apiClient';
import type { Session } from '@/modules/account/types';
import type { CreateStaffInput, UpdateStaffInput, StaffMember } from '@/modules/staff/types';

export const StaffService = {
  async listByStore(_storeId: string): Promise<StaffMember[]> {
    const { staff } = await apiClient.get<{ staff: StaffMember[] }>('/api/staff');
    return staff;
  },

  async getById(id: string): Promise<StaffMember | null> {
    try {
      const { staff } = await apiClient.get<{ staff: StaffMember }>(`/api/staff/${id}`);
      return staff;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  },

  async create(input: CreateStaffInput, _actorId?: string): Promise<StaffMember> {
    const { staff } = await apiClient.post<{ staff: StaffMember }>('/api/staff', {
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      role: input.role,
    });
    return staff;
  },

  async update(
    id: string,
    updates: UpdateStaffInput,
    _actorId?: string,
    _storeId?: string
  ): Promise<StaffMember> {
    const { staff } = await apiClient.put<{ staff: StaffMember }>(`/api/staff/${id}`, updates);
    return staff;
  },

  async deactivate(id: string, _actorId?: string, _storeId?: string): Promise<void> {
    await apiClient.post(`/api/staff/${id}/deactivate`);
  },

  async reactivate(id: string, _actorId?: string, _storeId?: string): Promise<void> {
    await apiClient.put(`/api/staff/${id}`, { isActive: true });
  },

  /** Login history / sessions for one staff member. */
  async getActiveSessions(userId: string): Promise<Session[]> {
    const { sessions } = await apiClient.get<{ sessions: Session[] }>(
      `/api/staff/${userId}/sessions`
    );
    return sessions;
  },
};
