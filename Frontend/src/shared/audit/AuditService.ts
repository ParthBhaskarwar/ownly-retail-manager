export const AuditService = {
  log: (action: string, entityId: string, storeId: string, details: any) => {
    console.log(`[AUDIT] ${action}`, { entityId, storeId, details });
  }
};
