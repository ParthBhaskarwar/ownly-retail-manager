import { getBackupStatus, BACKUP_REMINDER_DAYS } from '../src/modules/backup/services/BackupService';

const DAY = 86_400_000;

describe('getBackupStatus', () => {
  const now = new Date('2026-09-28T12:00:00Z').getTime();

  it('flags a store that has never been backed up', () => {
    const s = getBackupStatus(null, now);
    expect(s.backupDue).toBe(true);
    expect(s.tier).toBe('CRITICAL');
    expect(s.daysSinceLastBackup).toBeNull();
  });

  it('is healthy right after a backup', () => {
    const s = getBackupStatus(new Date(now - 60_000).toISOString(), now);
    expect(s.backupDue).toBe(false);
    expect(s.tier).toBe('HEALTHY');
    expect(s.daysSinceLastBackup).toBe(0);
  });

  it('stays healthy up to the reminder window', () => {
    const s = getBackupStatus(new Date(now - (BACKUP_REMINDER_DAYS - 1) * DAY).toISOString(), now);
    expect(s.backupDue).toBe(false);
  });

  it('warns once the reminder window has passed', () => {
    const s = getBackupStatus(new Date(now - BACKUP_REMINDER_DAYS * DAY).toISOString(), now);
    expect(s.backupDue).toBe(true);
    expect(s.tier).toBe('WARNING');
    expect(s.daysSinceLastBackup).toBe(BACKUP_REMINDER_DAYS);
  });
});
