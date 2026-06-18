export const PERMISSIONS = {
    fullAccess: "full_access",
    app: "/app",
    share: "/share",
    careers: "/careers"
};

export const ROLE_DEFINITIONS = {
    admin: {
        id: "admin",
        label: "Admin",
        permissions: [PERMISSIONS.app, PERMISSIONS.share, PERMISSIONS.careers]
    },
    recruiter: {
        id: "recruiter",
        label: "Recruiter",
        permissions: [PERMISSIONS.app, PERMISSIONS.share, PERMISSIONS.careers]
    }
};

export const MODULE_REQUIREMENTS = {
    recruitModule: [PERMISSIONS.app],
    careerPortal: [PERMISSIONS.careers],
    shareProfile: [PERMISSIONS.share],
    qrBridgeLogin: [PERMISSIONS.app],
    advancedAnalytics: [PERMISSIONS.app]
};

export let DYNAMIC_ROLES = {};

export function registerDynamicRoles(rolesArray) {
    DYNAMIC_ROLES = {};
    if (Array.isArray(rolesArray)) {
        rolesArray.forEach((role) => {
            const id = role.roleId || role.id;
            DYNAMIC_ROLES[id] = {
                id: id,
                label: role.label || role.name || id,
                permissions: role.permissions || [],
                custom: true,
                docId: role.id // Firestore document ID for update/delete
            };
        });
    }
}

export function getAllRoles() {
    return { ...ROLE_DEFINITIONS, ...DYNAMIC_ROLES };
}

export function getRole(roleId = "admin") {
    return getAllRoles()[roleId] || ROLE_DEFINITIONS.admin;
}
