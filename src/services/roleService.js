import { ROLE_DEFINITIONS } from "../config/rbac.js";

export function listSystemRoles() {
    return Object.values(ROLE_DEFINITIONS);
}
