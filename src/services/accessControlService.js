import { getRole } from "../config/rbac.js";

export function hasPermission(user, permission) {
    if (!user || user.status !== "active") return false;
    const role = getRole(user.role);
    if (!role) return false;
    return role.permissions.includes("full_access") || role.permissions.includes(permission);
}

export function canAccessModule(user, company, moduleKey) {
    if (!company || company.status !== "active") return false;
    if (!company.modulesEnabled || !company.modulesEnabled[moduleKey]) return false;
    
    // Check if user has explicit permission for the module or fullAccess
    return hasPermission(user, moduleKey);
}

export function canAddUser(company, activeUserCount) {
    if (!company || company.status !== "active") {
        return { allowed: false, reason: "Company is not active." };
    }

    const maxUsers = Number(company.userLimit || 1);
    if (activeUserCount >= maxUsers) {
        return { allowed: false, reason: `User limit reached: ${activeUserCount}/${maxUsers}.` };
    }

    return { allowed: true, reason: "User can be added." };
}
