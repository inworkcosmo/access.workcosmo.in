export const PERMISSIONS = {
    fullAccess: "full_access",
    hire: "hire",
    perform: "perform",
    core: "core"
};

export const ROLE_DEFINITIONS = {
    admin: {
        id: "admin",
        label: "Admin",
        permissions: [PERMISSIONS.fullAccess]
    },
    hr_operations: {
        id: "hr_operations",
        label: "HR Operations",
        permissions: [PERMISSIONS.hire, PERMISSIONS.perform, PERMISSIONS.core]
    },
    recruiter: {
        id: "recruiter",
        label: "Recruiter",
        permissions: [PERMISSIONS.hire]
    }
};

export const MODULE_REQUIREMENTS = {
    hire: [PERMISSIONS.hire],
    perform: [PERMISSIONS.perform],
    core: [PERMISSIONS.core]
};

export function getAllRoles() {
    return ROLE_DEFINITIONS;
}

export function getRole(roleId = "admin") {
    return ROLE_DEFINITIONS[roleId] || ROLE_DEFINITIONS.admin;
}
