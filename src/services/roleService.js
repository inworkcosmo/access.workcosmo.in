import { ROLE_DEFINITIONS } from "../config/rbac.js";
import { createRecord, listByCompany, updateRecord } from "./firestoreService.js";

export function listSystemRoles() {
    return Object.values(ROLE_DEFINITIONS);
}

export async function listCustomRoles(companyId) {
    return listByCompany("roles", companyId, "createdAt");
}

export async function createCustomRole(companyId, input) {
    return createRecord("roles", {
        roleId: crypto.randomUUID(),
        companyId,
        label: input.label,
        permissions: input.permissions || [],
        system: false,
        status: "active"
    });
}

export async function updateCustomRole(roleDocId, input) {
    return updateRecord("roles", roleDocId, input);
}
