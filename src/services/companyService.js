import { getRole } from "../config/rbac.js";
import { atomicCreateCompany, listByCompany, setRecord, updateRecord } from "./firestoreService.js";
import { canAddUser } from "./accessControlService.js";

export async function createCompanyWorkspace(input) {
    const companyId = input.companyId || crypto.randomUUID();
    const ownerId = input.ownerId || crypto.randomUUID();

    return atomicCreateCompany({
        company: {
            companyId,
            clientId: companyId,
            subdomain: companyId,
            companyName: input.companyName,
            ownerId,
            userLimit: Number(input.userLimit || 1),
            aiCredits: Number(input.aiCredits || 0),
            jobPostingCredits: Number(input.jobPostingCredits || 0),
            pricing: input.pricing || "",
            billingCycle: input.billingCycle || "monthly",
            status: "active",
            modulesEnabled: {
                hire: true,
                core: true,
                perform: true
            }
        },
        owner: {
            userId: ownerId,
            name: input.ownerName,
            email: input.ownerEmail.toLowerCase(),
            role: "admin",
            status: "active",
            inviteStatus: "accepted",
            companyId
        }
    });
}

export async function inviteUser({ company, activeUserCount, userId, name, email, role }) {
    const check = canAddUser(company, activeUserCount);
    if (!check.allowed) throw new Error(check.reason);

    return setRecord("users", userId, {
        userId,
        companyId: company.id,
        name,
        email: email.toLowerCase(),
        role,
        status: "active",
        inviteStatus: "credentials_sent",
        credentialsProvidedBy: "platform_admin",
        activatedAt: new Date().toISOString()
    });
}

export async function assignRole(userId, role) {
    if (!getRole(role)) throw new Error("Unknown role.");
    await updateRecord("users", userId, { role });
}

export async function getCompanyUsers(companyId) {
    return listByCompany("users", companyId);
}

export async function getCompanyActivity(companyId) {
    return listByCompany("activityLogs", companyId, "createdAt");
}
