import { createRecord } from "./firestoreService.js";

export async function logActivity({ companyId, actorId, action, entityType, entityId, metadata = {} }) {
    return createRecord("activityLogs", {
        companyId,
        actorId,
        action,
        entityType,
        entityId,
        metadata
    });
}
