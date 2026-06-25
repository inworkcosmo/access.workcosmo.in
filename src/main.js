import { PERMISSIONS, ROLE_DEFINITIONS, getAllRoles } from "./config/rbac.js";
import {
    canAccessModule,
    canAddUser,
    hasPermission
} from "./services/accessControlService.js";
import { watchAuth, login, logout, loadAccessSession } from "./services/authService.js";
import { createCompanyWorkspace, getCompanyUsers, inviteUser, assignRole } from "./services/companyService.js";
import {
    createRecord,
    listCollection,
    getRecord,
    updateRecord,
    deleteRecord,
    setRecord,
    listByCompany
} from "./services/firestoreService.js";
import {
    createBillingRecord,
    listBillingRecords,
    updateBillingRecord,
    deleteBillingRecord
} from "./services/billingService.js";
import { escapeHtml, formatDate, formatDateTime, inr, initials, percent } from "./utils/format.js";
import { toast } from "./utils/toast.js";
import { listSystemRoles } from "./services/roleService.js";
import { secondaryAuth } from "./services/firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { openModal } from "./components/modal.js";

const app = document.getElementById("app");

const views = {
    overview: {
        icon: "fa-gauge-high",
        label: "Overview",
        title: "Owner Control Center",
        subtitle: "Review system status, user usage, recent leads, and manual billing metrics."
    },
    companies: {
        icon: "fa-building-shield",
        label: "Companies",
        title: "Company Workspaces",
        subtitle: "Manually provision and configure client tenant workspaces."
    },
    users: {
        icon: "fa-users-gear",
        label: "Users",
        title: "User Management",
        subtitle: "Invite company users, enforce limits, and manage authentication accounts."
    },
    roles: {
        icon: "fa-user-lock",
        label: "Roles",
        title: "Roles & Permissions",
        subtitle: "Fixed authorization profiles and permissions matrix for Work Cosmo."
    },
    billing: {
        icon: "fa-file-invoice",
        label: "Billing",
        title: "Billing Ledger",
        subtitle: "Create, view, and manage invoices and payment records for client workspaces."
    },
    contacts: {
        icon: "fa-address-book",
        label: "Contacts",
        title: "Website Leads",
        subtitle: "Review website contact form submissions and CTA requests."
    },
    emails: {
        icon: "fa-envelope",
        label: "Emails",
        title: "Email Management",
        subtitle: "Manage shared email credentials and assigned mailboxes for client portals."
    }
};

let state = {
    view: "overview",
    session: null,
    companies: [],
    users: [],
    emails: [],
    billingRecords: [],
    contactMessages: [],
    emailSearch: "",
    userSearch: "",
    userCompanyFilter: "",
    userRoleFilter: "",
    billingCompanyFilter: "",
    contactStatusFilter: "",
    contactSearch: ""
};

document.addEventListener("DOMContentLoaded", () => {
    renderShell();
    watchAuth(async (firebaseUser) => {
        try {
            state.session = await loadAccessSession(firebaseUser);
            if (!state.session?.blocked) {
                await loadData();
            }
            renderShell();
        } catch (error) {
            console.error(error);
            renderLogin(error.message);
        }
    });
});

async function loadData() {
    const [companies, users, emails, billingRecords, contactMessages] = await Promise.all([
        safeList("companies"),
        safeList("users"),
        safeList("emails"),
        safeList("billingRecords"),
        safeList("contact_messages")
    ]);

    state = {
        ...state,
        companies,
        users,
        emails,
        billingRecords,
        contactMessages
    };

    // Add utility to window to fix misaligned user IDs
    window.fixMisalignedUsers = async () => {
        let fixedCount = 0;
        for (const u of state.users) {
            if (u.id && u.userId && u.id !== u.userId) {
                console.log(`Fixing misaligned user: ${u.email} (Old ID: ${u.id}, New ID: ${u.userId})`);
                await setRecord("users", u.userId, { ...u });
                await deleteRecord("users", u.id);
                fixedCount++;
            }
        }
        if (fixedCount > 0) {
            alert(`Fixed ${fixedCount} misaligned users! Please refresh the page.`);
        } else {
            alert("No misaligned users found.");
        }
    };
}

async function safeList(path) {
    try {
        return await listCollection(path);
    } catch (error) {
        if (error.code === "permission-denied" || error.message.includes("permissions")) {
            console.warn(`${path} is blocked by Firestore rules for this account.`);
            return [];
        }
        throw error;
    }
}

function renderShell() {
    if (!state.session?.firebaseUser) {
        renderLogin();
        return;
    }

    if (state.session.blocked) {
        renderExpired();
        return;
    }

    const current = views[state.view];
    app.className = "";
    app.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-screen bg-transparent">
            <aside class="sticky top-0 h-screen flex flex-col gap-6 p-6 bg-white/60 backdrop-blur-xl border-r border-slate-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-pink-500 rounded-xl flex items-center justify-center text-slate-900 text-lg shadow-md"><i class="fas fa-shield-halved"></i></div>
                    <div>
                        <span class="block text-[17px] font-black text-slate-900">Work Cosmo</span>
                        <span class="text-xs text-slate-500 font-medium">Control Center</span>
                    </div>
                </div>
                <nav class="grid gap-2">
                    ${Object.entries(views)
            .map(
                ([key, view]) => `
                        <button class="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${key === state.view ? "text-blue-600 bg-blue-50 shadow-sm shadow-blue-100" : "text-slate-500 hover:text-slate-900 hover:bg-white"}" data-view="${key}">
                            <i class="fas ${view.icon}"></i>
                            <span>${view.label}</span>
                        </button>
                    `
            )
            .join("")}
                </nav>
                <div class="mt-auto p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                            <i class="fas fa-user-shield"></i>
                        </div>
                        <div class="flex-1 overflow-hidden">
                            <strong class="block text-sm text-slate-800 truncate">${escapeHtml(state.session.company?.companyName || "Platform Admin")}</strong>
                            <span class="block text-xs text-slate-500 mt-0.5 truncate">${state.session.adminMode ? "Super Admin" : escapeHtml(state.session.user?.role || "Admin")}</span>
                        </div>
                    </div>
                    <button class="w-full flex items-center justify-center gap-2 px-4 py-2 font-bold rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-all" id="logoutButton" type="button">
                        <i class="fas fa-power-off"></i> Sign Out
                    </button>
                </div>
            </aside>
            <main class="min-w-0 p-6 md:p-8">
                <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white/60 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div class="flex flex-col">
                        <h1 class="text-3xl font-black text-slate-900 mb-1">${current.title}</h1>
                        <p class="text-sm text-slate-500 font-medium">${current.subtitle}</p>
                    </div>
                    <div class="flex gap-3">
                        <button class="inline-flex items-center justify-center gap-2 px-4 py-2.5 font-bold rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all" id="refreshButton" type="button">
                            <i class="fas fa-rotate"></i> Sync
                        </button>
                        <button class="inline-flex items-center justify-center gap-2 px-5 py-2.5 font-bold rounded-xl bg-gradient-to-r from-blue-600 to-pink-500 text-slate-900 hover:scale-[1.02] hover:shadow-lg hover:shadow-pink-500/25 transition-all" id="primaryAction" type="button">
                            <i class="fas fa-plus"></i> ${primaryActionLabel()}
                        </button>
                    </div>
                </header>
                <section id="viewRoot" class="animate-fade-in">${renderView()}</section>
            </main>
        </div>
    `;
    bindShellEvents();
    bindViewEvents();
}

function renderLogin(error = "") {
    app.className = "min-h-screen flex items-center justify-center p-6";
    app.innerHTML = `
        <form class="bg-white/80 backdrop-blur-xl border border-slate-200 p-8 md:p-10 rounded-3xl shadow-2xl shadow-blue-900/10 max-w-sm w-full grid gap-6 animate-slide-up" id="loginForm">
            <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-pink-500 rounded-2xl flex items-center justify-center text-slate-900 text-2xl mx-auto shadow-lg shadow-pink-500/20">
                <i class="fas fa-shield-halved"></i>
            </div>
            <div class="text-center">
                <h1 class="text-2xl font-black text-slate-900 mb-2">Work Cosmo Access</h1>
                <p class="text-sm font-medium text-slate-500">Private owner login portal.</p>
            </div>
            ${error ? `<div class="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-bold border border-red-100 text-center">${escapeHtml(error)}</div>` : ""}
            <div class="grid gap-1.5">
                <label for="loginEmail" class="text-sm font-bold text-slate-700">Email</label>
                <input id="loginEmail" type="email" autocomplete="email" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid gap-1.5">
                <label for="loginPassword" class="text-sm font-bold text-slate-700">Password</label>
                <input id="loginPassword" type="password" autocomplete="current-password" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <button class="w-full inline-flex items-center justify-center gap-2 px-5 py-3 font-bold rounded-xl bg-gradient-to-r from-blue-600 to-pink-500 text-slate-900 hover:scale-[1.02] hover:shadow-lg hover:shadow-pink-500/25 transition-all mt-2" type="submit"><i class="fas fa-lock"></i> Sign In</button>
        </form>
    `;
    document.getElementById("loginForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            await login(
                document.getElementById("loginEmail").value.trim(),
                document.getElementById("loginPassword").value
            );
        } catch (loginError) {
            toast(loginError.message, true);
        }
    });
}

function renderExpired() {
    app.className = "min-h-screen flex items-center justify-center p-6";
    app.innerHTML = `
        <div class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-2xl p-8 shadow-2xl shadow-slate-200 max-w-md w-full text-center">
            <p class="text-xs font-black tracking-widest uppercase text-pink-500 mb-2">${state.session.ownerOnly ? "Owner access required" : "Subscription required"}</p>
            <h1 class="text-2xl font-black text-slate-900 mb-4">${state.session.ownerOnly ? "This account is not an admin" : "Access is paused"}</h1>
            <p class="text-slate-500 text-sm mb-6">${escapeHtml(state.session.blockedReason || "Subscription inactive. Contact Work Cosmo to restore access.")}</p>
            ${state.session.ownerOnly ? `<p class="text-slate-500 text-sm mb-6">Create that Firestore document once, then refresh and sign in again.</p>` : ""}
            <div class="flex justify-center gap-3 flex-wrap">
                <button class="inline-flex items-center justify-center gap-2 px-4 py-2 font-bold rounded-xl bg-gradient-to-r from-blue-600 to-pink-500 text-slate-900 hover:scale-[1.02] transition-all" id="billingRetry"><i class="fas fa-copy"></i> Copy UID</button>
                <button class="inline-flex items-center justify-center gap-2 px-4 py-2 font-bold rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm transition-all" id="logoutButton"><i class="fas fa-arrow-right-from-bracket"></i> Logout</button>
            </div>
        </div>
    `;
    document.getElementById("logoutButton").addEventListener("click", logout);
    document.getElementById("billingRetry").addEventListener("click", () => {
        navigator.clipboard?.writeText(state.session.firebaseUser?.uid || "");
        toast("UID copied.");
    });
}

function renderView() {
    switch (state.view) {
        case "companies":
            return renderCompanies();
        case "users":
            return renderUsers();
        case "roles":
            return renderRoles();
        case "billing":
            return renderBilling();
        case "contacts":
            return renderContacts();
        case "emails":
            return renderEmails();
        default:
            return renderOverview();
    }
}

function renderOverview() {
    const totalCompanies = state.companies.length;
    const totalUsers = state.users.length;
    const totalInvoices = state.billingRecords.length;
    const totalRevenue = state.billingRecords.reduce((acc, r) => acc + Number(r.amount || 0), 0);
    const overdueBills = state.billingRecords.filter((r) => r.status === "overdue").length;

    const latestBilling = [...state.billingRecords]
        .sort((a, b) => {
            const aDate = a.invoiceDate ? new Date(a.invoiceDate) : new Date(0);
            const bDate = b.invoiceDate ? new Date(b.invoiceDate) : new Date(0);
            return bDate - aDate;
        })
        .slice(0, 5);

    return `
        <div class="grid gap-8">
            <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                ${metric("Companies", totalCompanies, "fa-building", "emerald")}
                ${metric("Total Users", totalUsers, "fa-users", "blue")}
                ${metric("Total Invoices", totalInvoices, "fa-file-invoice", "indigo")}
                ${metric("Revenue", inr.format(totalRevenue), "fa-indian-rupee-sign", "rose")}
            </section>

            <div class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
                <div class="bg-white/70 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                    <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h3 class="text-lg font-black text-slate-800">Latest Billing Activity</h3>
                            <p class="text-xs text-slate-500 font-medium">Recent invoices and payments</p>
                        </div>
                        ${badge(overdueBills + " Overdue", "danger")}
                    </div>
                    <div class="p-0 overflow-x-auto">
                        ${billingTable(latestBilling)}
                    </div>
                </div>
                <div class="grid gap-8 items-start">
                    <div class="bg-white/70 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                        <div class="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h3 class="text-lg font-black text-slate-800">Workspace Usage</h3>
                            <p class="text-xs text-slate-500 font-medium">Current client consumption</p>
                        </div>
                        <div class="p-6">
                            ${companyUsageList()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function recentLeadsTable(leads) {
    if (!leads.length) return empty("No website leads found.");
    return `
        <div class="table-wrap">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th class="px-6 py-4">Name</th>
                        <th class="px-6 py-4">Email</th>
                        <th class="px-6 py-4">Company Size</th>
                        <th class="px-6 py-4">Date</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${leads.map(lead => {
                        const date = lead.timestamp?.seconds ? new Date(lead.timestamp.seconds * 1000) : new Date(lead.timestamp || 0);
                        return `
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4 font-bold text-slate-800">${escapeHtml(lead.name || "Anonymous")}</td>
                                <td class="px-6 py-4 text-xs font-semibold text-slate-600">${escapeHtml(lead.email || "")}</td>
                                <td class="px-6 py-4">${badge(lead.company_size || "Unknown", "soft")}</td>
                                <td class="px-6 py-4 text-xs font-medium text-slate-500">${formatDateTime(date)}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderCompanies() {
    return `
        <div class="grid gap-8">
            <div class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-3xl p-6 shadow-lg shadow-slate-200/40">
                <div class="flex justify-between items-start gap-4 mb-4">
                    <div>
                        <h3 class="text-lg font-black text-slate-800">Managed Companies</h3>
                        <p class="text-slate-500 text-sm font-medium">${state.companies.length} company records</p>
                    </div>
                </div>
                ${companyTable(state.companies)}
            </div>
        </div>
    `;
}

function renderUsers() {
    const totalUsers = state.users.length;
    const activeUsers = state.users.filter((u) => u.status === "active").length;
    const pendingInvites = state.users.filter(
        (u) => u.inviteStatus === "invited" || u.inviteStatus === "credentials_sent" || u.status === "invited"
    ).length;
    const adminUsers = state.users.filter((u) => u.role === "owner" || u.role === "admin").length;

    // Real-time filtering logic
    const filtered = state.users.filter((user) => {
        const search = (state.userSearch || "").toLowerCase().trim();
        const matchesSearch =
            !search ||
            (user.name && user.name.toLowerCase().includes(search)) ||
            (user.email && user.email.toLowerCase().includes(search));

        const companyFilter = state.userCompanyFilter || "";
        const matchesCompany = !companyFilter || user.companyId === companyFilter;

        const roleFilter = state.userRoleFilter || "";
        const matchesRole = !roleFilter || user.role === roleFilter;

        return matchesSearch && matchesCompany && matchesRole;
    });

    return `
        <div class="grid gap-8">
            <!-- User Stat Cards -->
            <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                ${metric("Total Users", totalUsers, "fa-users", "blue")}
                ${metric("Active Users", activeUsers, "fa-user-check", "emerald")}
                ${metric("Pending Setup", pendingInvites, "fa-clock", "amber")}
                ${metric("Admins & Owners", adminUsers, "fa-user-shield", "indigo")}
            </section>

            <!-- Main Users Panel -->
            <div class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-3xl p-6 shadow-lg shadow-slate-200/40">
                <div class="flex flex-col gap-6">
                    <!-- Title & Header Section -->
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
                        <div>
                            <h3 class="text-xl font-black text-slate-800">User Records</h3>
                            <p class="text-slate-500 text-sm font-medium">Manage member profiles, access roles, and status levels across all customer workspaces.</p>
                        </div>
                        <button id="btnOpenUserModalDirect" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-pink-500 text-slate-900 font-bold rounded-xl hover:shadow-lg hover:shadow-pink-500/20 hover:scale-[1.02] transition-all text-sm">
                            <i class="fas fa-user-plus"></i> Invite User
                        </button>
                    </div>

                    <!-- Search & Filter Controls -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="relative">
                            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                                <i class="fas fa-magnifying-glass text-sm"></i>
                            </span>
                            <input id="userSearch" type="search" placeholder="Search by name or email..." value="${escapeHtml(state.userSearch || "")}" class="w-full min-h-[42px] pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm" />
                        </div>
                        
                        <div>
                            <select id="userCompanyFilter" class="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm">
                                <option value="">All Companies</option>
                                ${state.companies.map((c) => `<option value="${c.id}" ${state.userCompanyFilter === c.id ? "selected" : ""}>${escapeHtml(c.companyName)}</option>`).join("")}
                            </select>
                        </div>

                        <div>
                            <select id="userRoleFilter" class="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm">
                                <option value="">All Roles</option>
                                ${Object.entries(getAllRoles())
            .map(
                ([key, role]) =>
                    `<option value="${key}" ${state.userRoleFilter === key ? "selected" : ""}>${escapeHtml(role.label)}</option>`
            )
            .join("")}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Users Table -->
                <div class="mt-4">
                    ${userTable(filtered)}
                </div>
            </div>
        </div>
    `;
}
function renderRoles() {
    const roles = Object.values(getAllRoles());
    const permissions = Object.values(PERMISSIONS);

    // Calculate metrics
    const totalRoles = roles.length;
    const totalPermissions = permissions.length;
    const assignedUsers = state.users.filter((u) => u.role).length;
    const adminsCount = state.users.filter((u) => u.role === "admin").length;

    return `
        <div class="space-y-8 animate-fade-in">
            <!-- Roles & Permissions Stat Cards -->
            <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                ${metric("System Roles", totalRoles, "fa-user-lock", "indigo")}
                ${metric("Ecosystem Scopes", totalPermissions, "fa-key", "blue")}
                ${metric("Assigned Users", assignedUsers, "fa-users-gear", "emerald")}
                ${metric("Admins", adminsCount, "fa-user-shield", "rose")}
            </section>

            <!-- RBAC Matrix -->
            <div class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-3xl shadow-lg shadow-slate-200/40 overflow-hidden">
                <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 class="text-lg font-black text-slate-800">Ecosystem Permission Matrix</h3>
                        <p class="text-xs text-slate-500 font-medium">Cross-role capability mapping for the Work Cosmo Access & SaaS Suites</p>
                    </div>
                    <div class="flex gap-2">
                        ${roles.map((r) => badge(r.label, "info")).join("")}
                    </div>
                </div>
                <div class="table-wrap overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <th class="px-6 py-4">Permission Scope</th>
                                ${roles.map((role) => `<th class="px-6 py-4 text-center">${role.label}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${permissions
            .map(
                (perm) => `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="font-bold text-slate-800">${perm.replace(/_/g, " ")}</div>
                                        <div class="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Module Capability</div>
                                    </td>
                                    ${roles
                        .map((role) => {
                            const has =
                                role.permissions.includes(perm) ||
                                role.permissions.includes("full_access");
                            return `
                                            <td class="px-6 py-4 text-center">
                                                <div class="flex justify-center">
                                                    <div class="w-7 h-7 rounded-lg flex items-center justify-center ${has
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : "bg-slate-100 text-slate-300"
                                }">
                                                        <i class="fas ${has ? "fa-check" : "fa-minus text-[10px]"}"></i>
                                                    </div>
                                                </div>
                                            </td>
                                        `;
                        })
                        .join("")}
                                </tr>
                            `
            )
            .join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Lower Action Row -->
            <div class="grid grid-cols-1 gap-8 items-start max-w-xl">
                <!-- Role Assignment -->
                <div class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-3xl p-6 shadow-lg shadow-slate-200/40">
                    <div class="border-b border-slate-100 pb-4 mb-5">
                        <h3 class="text-lg font-black text-slate-800">Assign Member Role</h3>
                        <p class="text-slate-500 text-sm font-medium">Instantly change dynamic authorization groups and RBAC profiles</p>
                    </div>
                    
                    <form id="roleForm" class="space-y-6">
                        <div class="grid gap-1.5">
                            <label class="text-xs font-black text-slate-500 uppercase tracking-widest">Select User</label>
                            <select id="roleUser" class="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all text-sm" required>
                                <option value="">Select a member...</option>
                                ${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)} (${escapeHtml(user.email)})</option>`).join("")}
                            </select>
                            <div id="roleCurrentRoleContainer" class="hidden text-xs font-semibold text-slate-500 mt-1.5 flex items-center gap-1.5">
                                <span>Current Role:</span>
                                <span id="roleCurrentRoleBadge"></span>
                            </div>
                        </div>

                        <div class="grid gap-1.5">
                            <label class="text-xs font-black text-slate-500 uppercase tracking-widest">Target Role</label>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                ${roles
            .map(
                (role) => `
                                    <label class="relative flex flex-col p-4 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:border-pink-300 hover:bg-white hover:shadow-md transition-all has-[:checked]:border-pink-500 has-[:checked]:bg-white has-[:checked]:ring-4 has-[:checked]:ring-pink-500/10">
                                        <input type="radio" name="roleValue" value="${role.id}" class="sr-only" required>
                                        <span class="text-sm font-bold text-slate-800">${role.label}</span>
                                        <span class="text-[10px] text-slate-500 font-medium mt-1">${role.permissions.length} Scopes</span>
                                    </label>
                                `
            )
            .join("")}
                            </div>
                        </div>

                        <button class="w-full inline-flex items-center justify-center gap-2 px-5 py-3 font-bold rounded-xl bg-gradient-to-r from-blue-600 to-pink-500 text-slate-900 hover:scale-[1.02] hover:shadow-lg hover:shadow-pink-500/25 transition-all" type="submit">
                            <i class="fas fa-user-shield"></i> Update Permissions
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `;
}

function renderBilling() {
    const totalInvoices = state.billingRecords.length;
    const paidInvoices = state.billingRecords.filter(r => r.status === 'paid').length;
    const overdueInvoices = state.billingRecords.filter(r => r.status === 'overdue').length;
    const totalAmount = state.billingRecords.reduce((acc, r) => acc + Number(r.amount || 0), 0);

    const filtered = state.billingRecords.filter(record => {
        const companyFilter = state.billingCompanyFilter || "";
        return !companyFilter || record.companyId === companyFilter;
    });

    return `
        <div class="grid gap-8">
            <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                ${metric("Total Invoices", totalInvoices, "fa-file-invoice", "blue")}
                ${metric("Paid", paidInvoices, "fa-check-double", "emerald")}
                ${metric("Overdue", overdueInvoices, "fa-triangle-exclamation", "rose")}
                ${metric("Total Volume", inr.format(totalAmount), "fa-indian-rupee-sign", "indigo")}
            </section>

            <div class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-3xl p-6 shadow-lg shadow-slate-200/40">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                        <h3 class="text-xl font-black text-slate-800">Billing Ledger</h3>
                        <p class="text-slate-500 text-sm font-medium">Manage manual invoices and payment records.</p>
                    </div>
                    <div class="flex gap-3">
                        <select id="billingCompanyFilter" class="min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm">
                            <option value="">All Companies</option>
                            ${state.companies.map((c) => `<option value="${c.id}" ${state.billingCompanyFilter === c.id ? "selected" : ""}>${escapeHtml(c.companyName)}</option>`).join("")}
                        </select>
                        <button id="btnOpenBillingModal" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-pink-500 text-slate-900 font-bold rounded-xl hover:shadow-lg hover:shadow-pink-500/20 hover:scale-[1.02] transition-all text-sm">
                            <i class="fa-solid fa-file-invoice-dollar"></i> Create Record
                        </button>
                    </div>
                </div>

                <div class="mt-4">
                    ${billingTable(filtered)}
                </div>
            </div>
        </div>
    `;
}

function renderContacts() {
    const totalLeads = state.contactMessages.length;
    const newLeads = state.contactMessages.filter(m => m.status === 'new' || !m.status).length;
    const convertedLeads = state.contactMessages.filter(m => m.status === 'converted').length;

    const filtered = state.contactMessages.filter(lead => {
        const search = (state.contactSearch || "").toLowerCase().trim();
        const matchesSearch = !search || 
            (lead.name && lead.name.toLowerCase().includes(search)) || 
            (lead.email && lead.email.toLowerCase().includes(search));

        const statusFilter = state.contactStatusFilter || "";
        const leadStatus = lead.status || "new";
        const matchesStatus = !statusFilter || leadStatus === statusFilter;

        return matchesSearch && matchesStatus;
    }).sort((a, b) => {
        const dateA = a.timestamp?.seconds ? new Date(a.timestamp.seconds * 1000) : new Date(a.timestamp || 0);
        const dateB = b.timestamp?.seconds ? new Date(b.timestamp.seconds * 1000) : new Date(b.timestamp || 0);
        return dateB - dateA;
    });

    return `
        <div class="grid gap-8">
            <section class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${metric("Total Leads", totalLeads, "fa-address-book", "blue")}
                ${metric("New Leads", newLeads, "fa-star", "amber")}
                ${metric("Converted", convertedLeads, "fa-handshake", "emerald")}
            </section>

            <div class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-3xl p-6 shadow-lg shadow-slate-200/40">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                        <h3 class="text-xl font-black text-slate-800">Website Leads</h3>
                        <p class="text-slate-500 text-sm font-medium">Contact form submissions from the public website.</p>
                    </div>
                    <div class="flex gap-3">
                        <div class="relative">
                            <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                                <i class="fas fa-magnifying-glass text-sm"></i>
                            </span>
                            <input id="contactSearch" type="search" placeholder="Search leads..." value="${escapeHtml(state.contactSearch || "")}" class="w-full min-h-[42px] pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm" />
                        </div>
                        <select id="contactStatusFilter" class="min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm">
                            <option value="">All Statuses</option>
                            <option value="new" ${state.contactStatusFilter === "new" ? "selected" : ""}>New</option>
                            <option value="contacted" ${state.contactStatusFilter === "contacted" ? "selected" : ""}>Contacted</option>
                            <option value="converted" ${state.contactStatusFilter === "converted" ? "selected" : ""}>Converted</option>
                            <option value="dismissed" ${state.contactStatusFilter === "dismissed" ? "selected" : ""}>Dismissed</option>
                        </select>
                    </div>
                </div>

                <div class="mt-4">
                    ${contactsTable(filtered)}
                </div>
            </div>
        </div>
    `;
}

function renderEmails() {
    const filtered = state.emails.filter((email) => {
        const search = state.emailSearch.toLowerCase().trim();
        if (!search) return true;
        return [email.emailAddress, email.purpose, email.assignedTo, email.companyId]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(search));
    });

    return `
        <div class="grid gap-6">
            <section class="bg-white/90 backdrop-blur-lg border border-slate-200 rounded-3xl p-6 shadow-lg shadow-slate-200/40">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                        <h3 class="text-xl font-black text-slate-900">Email Credentials</h3>
                        <p class="text-sm text-slate-500">Store and manage shared mailbox credentials used by your access portal.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <input id="emailSearch" type="search" placeholder="Search..." value="${escapeHtml(state.emailSearch)}" class="w-full sm:w-72 min-h-[42px] px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                        <button id="btnAddEmail" class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-pink-500 text-slate-900 font-bold rounded-xl hover:shadow-lg hover:shadow-pink-500/20 transition-all"><i class="fas fa-plus"></i> Add Email</button>
                    </div>
                </div>
                ${emailTable(filtered)}
            </section>
        </div>
    `;
}

function emailTable(emails) {
    if (!emails.length) return empty("No email credentials found.");
    return `
        <div class="table-wrap overflow-x-auto">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th class="px-6 py-4">Email Address</th>
                        <th class="px-6 py-4">Password</th>
                        <th class="px-6 py-4">Purpose</th>
                        <th class="px-6 py-4">Assigned To</th>
                        <th class="px-6 py-4">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${emails
            .map(
                (email) => `
                                <tr class="hover:bg-slate-50 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="font-bold text-slate-800">${escapeHtml(email.emailAddress)}</div>
                                        <div class="text-[10px] text-slate-500 font-medium">${escapeHtml(email.companyId || "Global")}</div>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="inline-flex items-center gap-3">
                                            <span id="pwd-${email.id}" class="font-mono text-[13px] text-slate-700">${escapeHtml(email.password ? "•".repeat(10) : "")}</span>
                                            <button class="text-slate-500 hover:text-slate-900" type="button" data-email-action="toggle-visibility" data-email-id="${email.id}" title="Show/Hide password"><i class="fas fa-eye"></i></button>
                                            <button class="text-slate-500 hover:text-slate-900" type="button" data-email-action="copy-password" data-email-id="${email.id}" title="Copy password"><i class="fas fa-copy"></i></button>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4">${badge(email.purpose || "General", "soft")}</td>
                                    <td class="px-6 py-4">${escapeHtml(email.assignedTo || "Unassigned")}</td>
                                    <td class="px-6 py-4">${recordActions("emails", email.id)}</td>
                                </tr>
                            `
            )
            .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderEmailModalPayload(email = {}) {
    const now = new Date().toISOString();
    return `
        <div class="grid gap-1.5">
            <label class="text-sm font-bold text-slate-700">Email Address</label>
            <input id="emailAddress" type="email" required value="${escapeHtml(email.emailAddress || "")}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" />
        </div>
        <div class="grid gap-1.5">
            <label class="text-sm font-bold text-slate-700">Password</label>
            <input id="password" type="text" required value="${escapeHtml(email.password || "")}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" />
        </div>
        <div class="grid gap-1.5">
            <label class="text-sm font-bold text-slate-700">Purpose</label>
            <input id="purpose" value="${escapeHtml(email.purpose || "")}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" />
        </div>
        <div class="grid gap-1.5">
            <label class="text-sm font-bold text-slate-700">Assigned To</label>
            <input id="assignedTo" value="${escapeHtml(email.assignedTo || "")}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" />
        </div>
        <div class="grid gap-1.5">
            <label class="text-sm font-bold text-slate-700">Company ID</label>
            <input id="companyId" value="${escapeHtml(email.companyId || "")}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" />
        </div>
        <input type="hidden" id="createdAt" value="${escapeHtml(email.createdAt || now)}" />
    `;
}

function renderModules() {
    const company = selectedCompany();
    const subscription = selectedSubscription(company);
    const user = state.session.user;

    return `
        <div class="grid">
            <section class="panel">
                <div class="table-head">
                    <div>
                        <h3>Current Access Evaluation</h3>
                        <p class="muted">Reusable helper output for <code>hasPermission()</code>, <code>hasFeature()</code>, and module gates.</p>
                    </div>
                </div>
                <div class="grid three">
                    ${Object.values(FEATURES)
            .map(
                (feature) => `
                        <div class="panel">
                            <h3>${feature.label}</h3>
                            <p class="muted">${feature.description}</p>
                            ${badge(hasFeature(company, subscription, feature.key) ? "Plan enabled" : "Plan blocked", hasFeature(company, subscription, feature.key) ? "success" : "danger")}
                            ${badge(canAccessModule(user, company, subscription, feature.key) ? "Role allowed" : "Role blocked", canAccessModule(user, company, subscription, feature.key) ? "success" : "warning")}
                        </div>
                    `
            )
            .join("")}
                </div>
            </section>
            <section class="panel">
                <h3>Permission Probe</h3>
                <p class="muted">Active user: ${escapeHtml(user?.name || "Unknown")} - role: ${escapeHtml(user?.role || "none")}</p>
                <div>${Object.values(PERMISSIONS)
            .map((permission) =>
                badge(
                    `${permission}: ${hasPermission(user, permission) ? "yes" : "no"}`,
                    hasPermission(user, permission) ? "success" : "soft"
                )
            )
            .join("")}</div>
            </section>
        </div>
    `;
}

function renderArchitecture() {
    return `
        <div class="grid">
            <section class="hero">
                <div>
                    <p class="eyebrow">Login access flow</p>
                    <h2>Payment request first, owner activation second.</h2>
                    <p class="muted">Buyers pay on the public site. You confirm payment here, then customers use <code>app.workcosmo.in</code> after their access pass is active.</p>
                </div>
                <div class="domain-strip">
                    ${domainItem("1. Firebase Auth", "Verify signed-in user")}
                    ${domainItem("2. /platformAdmins/{uid}", "Your private owner access to all tenants")}
                    ${domainItem("3. /purchaseRequests/{id}", "Paid buyer request awaiting owner confirmation")}
                    ${domainItem("4. /users/{uid}", "Customer app login profile")}
                    ${domainItem("5. /companies/{companyId}", "Tenant status and plan")}
                    ${domainItem("6. /subscriptions/{id}", "Status, expiry, grace, suspension")}
                </div>
            </section>
            <section class="grid two">
                <div class="panel">
                    <h3>Firestore Collections</h3>
                    <div class="domain-strip">
                        ${domainItem("/platformAdmins/{uid}", "owner-only admin access for this panel")}
                        ${domainItem("/purchaseRequests/{id}", "buyer, company, Razorpay ids, payment and provisioning status")}
                        ${domainItem("/accessPasses/{id}", "final company, plan, modules, owner, and app login handoff")}
                        ${domainItem("/companies/{companyId}", "companyName, ownerId, subscriptionId, plan, maxUsers, status, features, modulesEnabled")}
                        ${domainItem("/users/{userId}", "companyId, name, email, role, status, inviteStatus")}
                        ${domainItem("/subscriptions/{subscriptionId}", "plan, maxUsers, status, dates, Razorpay ids, custom limits")}
                        ${domainItem("/roles/{roleId}", "companyId, label, permissions, status")}
                        ${domainItem("/permissions/{permissionId}", "key, module, description")}
                    </div>
                </div>
                <div class="panel">
                    <h3>Production Notes</h3>
                    <div class="domain-strip">
                        ${domainItem("Tenant isolation", "All RMS reads and writes include companyId equality checks.")}
                        ${domainItem("Optimized queries", "Use companyId + createdAt indexes for users, jobs, candidates, and logs.")}
                        ${domainItem("Credential flow", "You create Auth users, add /users profiles, and send app link plus credentials.")}
                        ${domainItem("Webhook sync", "Existing Razorpay webhook updates /subscriptions.")}
                        ${domainItem("Suspension", "Failed payment enters grace, then suspended after gracePeriodDays.")}
                    </div>
                </div>
            </section>
        </div>
    `;
}

function bindShellEvents() {
    document.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            state.view = button.dataset.view;
            renderShell();
        });
    });

    document.getElementById("logoutButton")?.addEventListener("click", logout);
    document.getElementById("refreshButton")?.addEventListener("click", async () => {
        await loadData();
        renderShell();
        toast("Data refreshed.");
    });
    document.getElementById("primaryAction")?.addEventListener("click", () => {
        switch (state.view) {
            case "companies":
                showCompanyModal();
                break;
            case "users":
                showUserModal();
                break;
            case "billing":
                showBillingModal();
                break;
            case "roles":
                showRoleModal();
                break;
            case "emails":
                showEmailModal();
                break;
            default:
                break;
        }
    });
}

function bindViewEvents() {
    // Setup Modal Triggers
    document.getElementById("btnOpenCompanyModal")?.addEventListener("click", showCompanyModal);
    document.getElementById("btnOpenUserModal")?.addEventListener("click", showUserModal);
    document.getElementById("btnOpenBillingModal")?.addEventListener("click", showBillingModal);
    document.getElementById("btnOpenRoleModal")?.addEventListener("click", showRoleModal);
    document.getElementById("btnAddEmail")?.addEventListener("click", () => showEmailModal());
    document.getElementById("emailSearch")?.addEventListener("input", (event) => {
        state.emailSearch = event.target.value || "";
        renderShell();
        const input = document.getElementById("emailSearch");
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    });

    // Billing View Interactions
    document.getElementById("billingCompanyFilter")?.addEventListener("change", (event) => {
        state.billingCompanyFilter = event.target.value || "";
        renderShell();
    });

    // Contacts View Interactions
    document.getElementById("contactSearch")?.addEventListener("input", (event) => {
        state.contactSearch = event.target.value || "";
        renderShell();
        const input = document.getElementById("contactSearch");
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    });
    document.getElementById("contactStatusFilter")?.addEventListener("change", (event) => {
        state.contactStatusFilter = event.target.value || "";
        renderShell();
    });
    document.querySelectorAll(".contact-status-selector").forEach((select) => {
        select.addEventListener("change", async (event) => {
            const id = event.target.dataset.contactId;
            const newStatus = event.target.value;
            try {
                await updateRecord("contact_messages", id, { status: newStatus });
                toast("Contact status updated");
                await loadData();
                renderShell();
            } catch (error) {
                toast("Failed to update status", true);
            }
        });
    });

    // Users View Interactions
    document.getElementById("btnOpenUserModalDirect")?.addEventListener("click", showUserModal);
    document.getElementById("userSearch")?.addEventListener("input", (event) => {
        state.userSearch = event.target.value || "";
        renderShell();
        const input = document.getElementById("userSearch");
        if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    });
    document.getElementById("userCompanyFilter")?.addEventListener("change", (event) => {
        state.userCompanyFilter = event.target.value || "";
        renderShell();
    });
    document.getElementById("userRoleFilter")?.addEventListener("change", (event) => {
        state.userRoleFilter = event.target.value || "";
        renderShell();
    });

    // Roles View Interactions
    document.getElementById("roleUser")?.addEventListener("change", (event) => {
        const userId = event.target.value;
        const container = document.getElementById("roleCurrentRoleContainer");
        const badgeSpan = document.getElementById("roleCurrentRoleBadge");
        if (userId && container && badgeSpan) {
            const user = state.users.find((u) => u.id === userId);
            if (user) {
                const roleLabel = getAllRoles()[user.role]?.label || user.role || "None";
                badgeSpan.innerHTML = badge(roleLabel, "info");
                container.classList.remove("hidden");
            } else {
                container.classList.add("hidden");
            }
        } else if (container) {
            container.classList.add("hidden");
        }
    });
    document.getElementById("roleForm")?.addEventListener("submit", handleAssignRole);

    const companyNameInput = document.getElementById("companyName");
    const companySubdomainInput = document.getElementById("companySubdomain");
    if (companyNameInput && companySubdomainInput && !companySubdomainInput.value) {
        companyNameInput.addEventListener("input", () => {
            companySubdomainInput.value = getClientId(companyNameInput.value);
        });
    }

    document.querySelectorAll("[data-provision-request]").forEach((button) => {
        button.addEventListener("click", () => handleProvisionRequest(button.dataset.provisionRequest));
    });

    document.querySelectorAll("[data-email-action]").forEach((button) => {
        button.addEventListener("click", () => handleEmailAction(button));
    });

    document.querySelectorAll("[data-record-action]").forEach((button) => {
        button.addEventListener("click", () => handleRecordAction(button));
    });

    // AI Credits adjustment buttons
    document.querySelectorAll("[data-adjust-credits]").forEach((button) => {
        button.addEventListener("click", () => showAiCreditsModal(button.dataset.adjustCredits));
    });

    // AI Credits adjustment history buttons
    document.querySelectorAll("[data-view-credit-logs]").forEach((button) => {
        button.addEventListener("click", () => showAiCreditsHistoryModal(button.dataset.viewCreditLogs));
    });
}

function showEmailModal(email = {}) {
    openModal({
        title: email.id ? "Edit Email Credential" : "Add Email Credential",
        submitLabel: email ? "Save Email" : "Create Email",
        content: renderEmailModalPayload(email),
        onSubmit: async (_e, _form, close) => {
            const payload = {
                emailAddress: document.getElementById("emailAddress").value.trim(),
                password: document.getElementById("password").value.trim(),
                purpose: document.getElementById("purpose").value.trim(),
                assignedTo: document.getElementById("assignedTo").value.trim(),
                companyId: document.getElementById("companyId").value.trim() || "",
                createdAt: document.getElementById("createdAt").value
            };

            if (!payload.emailAddress || !payload.password) {
                toast("Email address and password are required.", true);
                return;
            }

            if (email?.id) {
                await updateRecord("emails", email.id, payload);
                toast("Email updated.");
            } else {
                await createRecord("emails", payload);
                toast("Email created.");
            }

            await loadData();
            renderShell();
            close();
        }
    });
}

function handleEmailAction(button) {
    const action = button.dataset.emailAction;
    const id = button.dataset.emailId;
    const email = state.emails.find((item) => item.id === id);
    if (!email) {
        toast("Email record not found.", true);
        return;
    }

    if (action === "copy-password") {
        navigator.clipboard?.writeText(email.password || "");
        toast("Password copied to clipboard.");
        return;
    }

    if (action === "toggle-visibility") {
        const passwordField = document.getElementById(`pwd-${id}`);
        if (!passwordField) return;
        const currentlyMasked = passwordField.textContent.includes("•");
        passwordField.textContent = currentlyMasked ? email.password || "" : "•".repeat(10);
        return;
    }
}

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-") // Replace spaces with -
        .replace(/[^\w\-]+/g, "") // Remove all non-word chars
        .replace(/\-\-+/g, "-") // Replace multiple - with single -
        .replace(/^-+/, "") // Trim - from start
        .replace(/-+$/, ""); // Trim - from end
}

function getClientId(value) {
    return slugify(value || "");
}

async function handleProvisionRequest(requestId) {
    const request = state.purchaseRequests.find((item) => item.id === requestId);
    if (!request) {
        toast("Purchase request not found.", true);
        return;
    }

    // 1. Prompt for customized subdomain slug
    const suggestedSlug = getClientId(request.companyName);
    const companySlug = getClientId(
        prompt(
            "Confirm Client ID / Subdomain for this Company:\n(e.g., entering 'brawn' will create brawn.workcosmo.in/app)",
            suggestedSlug
        )
    );
    if (!companySlug) {
        toast("Provisioning cancelled.", true);
        return;
    }

    // 2. Register Firebase Auth Account using Secondary Auth
    const tempPassword = "WorkCosmo@2026!"; // Temporary password for initial provisioning
    let firebaseUser;
    try {
        toast("Creating secure login credentials...", false);
        const authCredential = await createUserWithEmailAndPassword(secondaryAuth, request.buyerEmail, tempPassword);
        firebaseUser = authCredential.user;
    } catch (authError) {
        if (authError.code === "auth/email-already-in-use") {
            const uid = prompt(
                "An authentication account with this email already exists.\nIf you want to link to their existing account, enter their Firebase UID from the console below (or click Cancel):"
            );
            if (!uid) {
                toast("Provisioning cancelled.", true);
                return;
            }
            firebaseUser = { uid, email: request.buyerEmail };
        } else {
            console.error("Auth Creation Error:", authError);
            toast("Failed to create Auth user: " + authError.message, true);
            return;
        }
    }

    // 3. Update subscription record fields first so resolver gets correct tier configuration
    await updateRecord("subscriptions", request.id, {
        customerName: request.buyerName,
        customerEmail: request.buyerEmail,
        plan: request.plan,
        status: "active",
        provisioningStatus: "completed",
        updatedAt: new Date().toISOString()
    });

    const subscription = await getRecord("subscriptions", request.id);

    // 4. Provision Company Workspace with Slugified companyId
    toast("Provisioning workspace...", false);
    const companyId = await createCompanyWorkspace(subscription, {
        companyId: companySlug,
        companyName: request.companyName,
        ownerId: firebaseUser.uid,
        ownerName: request.buyerName,
        ownerEmail: request.buyerEmail
    });

    // 5. Create Access Pass record
    const accessPassId = await createRecord("accessPasses", {
        purchaseRequestId: request.id,
        subscriptionId: request.id,
        companyId,
        ownerId: firebaseUser.uid,
        ownerEmail: request.buyerEmail,
        ownerName: request.buyerName,
        companyName: request.companyName,
        plan: request.plan,
        planName: planName(request.plan),
        maxUsers: resolvePlanLimits(subscription).maxUsers,
        features: resolvePlanLimits(subscription).features,
        appUrl: `https://space.workcosmo.in`,
        hireUrl: `https://hire.workcosmo.in/${companySlug}`,
        status: "active",
        activatedAt: new Date().toISOString(),
        activatedBy: state.session.user?.email || "owner"
    });

    await loadData();
    renderShell();

    // 6. Copy details to clipboard and show immersive alert
    const credentialsText = `Space URL: https://space.workcosmo.in\nClient ID: ${companySlug}\nHire URL: https://hire.workcosmo.in/${companySlug}\nAdmin Email: ${request.buyerEmail}\nDefault Password: ${tempPassword}`;
    navigator.clipboard?.writeText(credentialsText);
    alert(
        `🎉 Workspace Provisioned Successfully!\n\nCredentials have been COPIED to your clipboard:\n\n${credentialsText}\n\nYou can now paste this directly into an email to your client.`
    );
}

// Legacy inline form handlers removed: creation flows now use modal dialogs
// (handleCreateSubscription, _handleCreateCompanyOld, _handleInviteUserOld)

async function handleAssignRole(event) {
    event.preventDefault();
    const userId = document.getElementById("roleUser").value;
    const roleInput = document.querySelector('#roleForm input[name="roleValue"]:checked');
    if (!userId || !roleInput) {
        toast("Please select a user and a target role.", true);
        return;
    }
    const role = roleInput.value;
    await assignRole(userId, role);
    await loadData();
    renderShell();
    toast("Role assigned successfully.");
}

async function handleSubscriptionAction(button) {
    const id = button.dataset.subId;
    const action = button.dataset.subAction;
    const plan = button.dataset.plan;

    if (action === "upgrade") await upgradePlan(id, plan);
    if (action === "downgrade") await scheduleDowngrade(id, plan);
    if (action === "cancel") await cancelSubscription(id);
    if (action === "suspend") await updateRecord("subscriptions", id, { status: "suspended" });

    await loadData();
    renderShell();
    toast(`Subscription ${action} saved.`);
}

function openRecordModal(title, contentText, isReadOnly, onSave) {
    const existing = document.getElementById("custom-modal");
    if (existing) existing.remove();

    let data = {};
    try {
        data = JSON.parse(contentText);
    } catch (e) {
        data = { content: contentText };
    }

    const generateFormFields = (obj, prefix = "") => {
        let html = "";
        for (const [key, value] of Object.entries(obj)) {
            const fieldId = `field-${prefix}${key}`;
            const fieldLabel = key.replace(/([A-Z])/g, " $1").trim();

            if (value === null) {
                html += `
                    <div class="mb-3">
                        <label class="block text-xs font-bold text-slate-500 mb-1">${escapeHtml(fieldLabel)}</label>
                        <input type="text" id="${fieldId}" value="null" ${isReadOnly ? "disabled" : ""} class="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs focus:border-blue-500 outline-none transition-colors" />
                    </div>
                `;
            } else if (typeof value === "boolean") {
                html += `
                    <div class="mb-3">
                        <label class="block text-xs font-bold text-slate-500 mb-1">${escapeHtml(fieldLabel)}</label>
                        <select id="${fieldId}" ${isReadOnly ? "disabled" : ""} class="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs focus:border-blue-500 outline-none transition-colors">
                            <option value="true" ${value === true ? "selected" : ""}>True</option>
                            <option value="false" ${value === false ? "selected" : ""}>False</option>
                        </select>
                    </div>
                `;
            } else if (typeof value === "number") {
                html += `
                    <div class="mb-3">
                        <label class="block text-xs font-bold text-slate-500 mb-1">${escapeHtml(fieldLabel)}</label>
                        <input type="number" id="${fieldId}" value="${value}" ${isReadOnly ? "disabled" : ""} class="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs focus:border-blue-500 outline-none transition-colors" />
                    </div>
                `;
            } else if (Array.isArray(value)) {
                html += `
                    <div class="mb-3">
                        <label class="block text-xs font-bold text-slate-500 mb-1">${escapeHtml(fieldLabel)}</label>
                        <textarea id="${fieldId}" ${isReadOnly ? "disabled" : ""} class="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs font-mono focus:border-blue-500 outline-none transition-colors resize-none h-16">${JSON.stringify(value, null, 2)}</textarea>
                    </div>
                `;
            } else if (typeof value === "object" && value !== null) {
                html += `
                    <div class="mb-3 p-2 bg-slate-100/50 border border-slate-200 rounded-lg">
                        <label class="block text-xs font-bold text-slate-700 mb-2">${escapeHtml(fieldLabel)}</label>
                        <div class="ml-1">
                            ${generateFormFields(value, `${prefix}${key}-`)}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="mb-3">
                        <label class="block text-xs font-bold text-slate-500 mb-1">${escapeHtml(fieldLabel)}</label>
                        <input type="text" id="${fieldId}" value="${escapeHtml(String(value))}" ${isReadOnly ? "disabled" : ""} class="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs focus:border-blue-500 outline-none transition-colors" />
                    </div>
                `;
            }
        }
        return html;
    };

    const generateDisplayFields = (obj, prefix = "") => {
        let html = "";
        for (const [key, value] of Object.entries(obj)) {
            const fieldLabel = key.replace(/([A-Z])/g, " $1").trim();

            if (value === null) {
                html += `
                    <div class="grid gap-1 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                        <div class="text-[10px] uppercase tracking-widest text-slate-500">${escapeHtml(fieldLabel)}</div>
                        <div class="text-sm text-slate-800">null</div>
                    </div>
                `;
            } else if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
                const displayValue = typeof value === "boolean" ? String(value) : value;
                html += `
                    <div class="grid gap-1 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                        <div class="text-[10px] uppercase tracking-widest text-slate-500">${escapeHtml(fieldLabel)}</div>
                        <div class="text-sm text-slate-800 font-mono break-all">${escapeHtml(String(displayValue))}</div>
                    </div>
                `;
            } else if (Array.isArray(value)) {
                html += `
                    <div class="grid gap-1 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                        <div class="text-[10px] uppercase tracking-widest text-slate-500">${escapeHtml(fieldLabel)}</div>
                        <pre class="text-sm text-slate-800 font-mono whitespace-pre-wrap break-words">${escapeHtml(JSON.stringify(value, null, 2))}</pre>
                    </div>
                `;
            } else if (typeof value === "object") {
                html += `
                    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                        <div class="text-[10px] uppercase tracking-widest text-slate-500 mb-2">${escapeHtml(fieldLabel)}</div>
                        <div class="grid gap-2">${generateDisplayFields(value, `${prefix}${key}-`)}</div>
                    </div>
                `;
            }
        }
        return html;
    };

    const modal = document.createElement("div");
    modal.id = "custom-modal";
    modal.className =
        "fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-sm p-4 animate-fade-in";
    modal.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[70vh]">
            <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-100/50 flex-shrink-0">
                <h3 class="text-base font-bold text-slate-900 truncate">${escapeHtml(title)}</h3>
                <button id="modal-close" class="text-slate-500 hover:text-slate-900 transition-colors flex-shrink-0 ml-4"><i class="fas fa-times"></i></button>
            </div>
            <div class="px-5 py-4 overflow-y-auto flex-1 min-h-0">
                ${isReadOnly ? `<div class="space-y-3">${generateDisplayFields(data)}</div>` : `<form id="modal-form" class="space-y-3">${generateFormFields(data)}</form>`}
            </div>
            <div class="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2 flex-shrink-0">
                <button id="modal-cancel" class="px-3 py-2 rounded-lg bg-slate-100/50 hover:bg-white/10 text-slate-900 text-xs font-bold transition-all">Close</button>
                ${isReadOnly ? "" : `<button id="modal-save" type="button" class="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-slate-900 text-xs font-bold shadow-lg shadow-blue-500/20 transition-all">Save</button>`}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById("modal-close").addEventListener("click", close);
    document.getElementById("modal-cancel").addEventListener("click", close);

    if (!isReadOnly) {
        document.getElementById("modal-save").addEventListener("click", () => {
            const formData = {};
            const form = document.getElementById("modal-form");
            const inputs = form.querySelectorAll("input, select, textarea");

            inputs.forEach((input) => {
                const fieldId = input.id;
                if (!fieldId) return;

                const path = fieldId.replace("field-", "").split("-");
                let current = formData;

                for (let i = 0; i < path.length - 1; i++) {
                    if (!current[path[i]]) current[path[i]] = {};
                    current = current[path[i]];
                }

                const key = path[path.length - 1];
                let value = input.value;

                if (input.tagName === "SELECT") {
                    value = value === "true" ? true : value === "false" ? false : value;
                } else if (input.type === "number") {
                    value = isNaN(Number(value)) ? value : Number(value);
                } else if (input.tagName === "TEXTAREA" && input.value.trim().startsWith("[")) {
                    try {
                        value = JSON.parse(input.value);
                    } catch (e) {
                        value = input.value;
                    }
                }

                current[key] = value;
            });

            const result = Object.keys(formData).length === 0 ? contentText : JSON.stringify(formData, null, 2);
            onSave(result);
            close();
        });
    }
}

async function handleRecordAction(button) {
    const action = button.dataset.recordAction;
    const collectionName = button.dataset.collection;
    const id = button.dataset.recordId;
    const record = findRecord(collectionName, id);

    if (!record) {
        toast("Record not found.", true);
        return;
    }

    if (action === "view") {
        if (collectionName === "billingRecords") {
            showBillingRecordView(record);
            return;
        }
        openRecordModal(`View ${collectionName}/${id}`, JSON.stringify(record, null, 2), true);
        return;
    }

    if (action === "pdf") {
        if (collectionName === "billingRecords") {
            downloadBillingInvoiceAsPdf(record);
            return;
        }
    }

    if (action === "edit") {
        if (collectionName === "billingRecords") {
            showBillingModal(record);
            return;
        }
        if (collectionName === "emails") {
            showEmailModal(record);
            return;
        }

        const editableRecord = { ...record };
        delete editableRecord.id;
        delete editableRecord.createdAt;
        delete editableRecord.updatedAt;

        openRecordModal(
            `Edit ${collectionName}/${id}`,
            JSON.stringify(editableRecord, null, 2),
            false,
            async (input) => {
                if (!input) return;
                try {
                    const payload = JSON.parse(input);
                    await updateRecord(collectionName, id, payload);
                    await loadData();
                    renderShell();
                    toast("Record updated.");
                } catch (error) {
                    toast(`Edit failed: ${error.message}`, true);
                }
            }
        );
        return;
    }

    if (action === "delete") {
        const confirmed = confirm(`Delete ${collectionName}/${id}? This cannot be undone.`);
        if (!confirmed) return;

        try {
            await deleteRecord(collectionName, id);
            await loadData();
            renderShell();
            toast("Record deleted.");
        } catch (error) {
            toast(`Delete failed: ${error.message}`, true);
        }
    }
}

function findRecord(collectionName, id) {
    const collections = {
        subscriptions: state.subscriptions,
        companies: state.companies,
        users: state.users,
        roles: state.roles,
        permissions: state.permissions,
        accessPasses: state.accessPasses,
        purchaseRequests: state.purchaseRequests,
        emails: state.emails,
        billingRecords: state.billingRecords
    };
    return collections[collectionName]?.find((item) => item.id === id);
}

function purchaseRequestTable(requests, compact = false) {
    if (!requests.length) return empty("No purchase requests in this queue.");
    return `
        <div class="table-wrap overflow-x-auto">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th class="px-6 py-4">Buyer</th>
                        <th class="px-6 py-4">Plan</th>
                        <th class="px-6 py-4">Status</th>
                        <th class="px-6 py-4">Provisioning</th>
                        ${compact ? "" : '<th class="px-6 py-4">Action</th>'}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${requests
            .map((request) => {
                const completed = request.provisioningStatus === "completed";
                return `
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="font-bold text-slate-800">${escapeHtml(request.companyName || request.buyerName || "Unknown buyer")}</div>
                                    <div class="text-[10px] text-slate-500 font-medium">${escapeHtml(request.buyerEmail || "")}</div>
                                </td>
                                <td class="px-6 py-4">
                                    ${badge(planName(request.plan), "info")}
                                    <div class="text-[10px] text-slate-500 mt-1">${request.maxUsers || resolvePlanLimits(request).maxUsers} users</div>
                                </td>
                                <td class="px-6 py-4">
                                    ${badge(request.status || "pending", statusTone(request.status))}
                                    <div class="text-[10px] text-slate-500 mt-1">${formatDateTime(request.updatedAt || request.createdAt)}</div>
                                </td>
                                <td class="px-6 py-4">${badge(request.provisioningStatus || "idle", completed ? "success" : "warning")}</td>
                                ${compact
                        ? ""
                        : `
                                    <td class="px-6 py-4">
                                        <button class="px-4 py-2 rounded-xl bg-blue-600 text-slate-900 text-xs font-bold shadow-lg shadow-blue-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100" data-provision-request="${request.id}" ${completed ? "disabled" : ""}>
                                            Activate
                                        </button>
                                    </td>
                                `
                    }
                            </tr>
                        `;
            })
            .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function companyTable(companies) {
    if (!companies.length) return empty("No companies provisioned yet.");
    return `
        <div class="table-wrap">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th class="px-6 py-4">Company</th>
                        <th class="px-6 py-4">Pricing & Cycle</th>
                        <th class="px-6 py-4">Status</th>
                        <th class="px-6 py-4">Users</th>
                        <th class="px-6 py-4">AI Credits</th>
                        <th class="px-6 py-4">Job Credits</th>
                        <th class="px-6 py-4">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${companies
            .map((company) => {
                const used = userCount(company.id);
                const limit = Number(company.userLimit || 1);
                return `
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="font-bold text-slate-800">${escapeHtml(company.companyName)}</div>
                                    <div class="text-[10px] text-slate-500 font-medium">${escapeHtml(company.id)}</div>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="font-semibold text-xs text-slate-700">${escapeHtml(company.pricing || "₹0/mo")}</div>
                                    <div class="text-[9px] text-slate-400 font-bold uppercase">${escapeHtml(company.billingCycle || "monthly")}</div>
                                </td>
                                <td class="px-6 py-4">${badge(company.status || "active", statusTone(company.status))}</td>
                                <td class="px-6 py-4">
                                    <div class="flex justify-between text-[10px] font-bold mb-1">
                                        <span>${used} / ${limit}</span>
                                        <span>${percent(used, limit)}%</span>
                                    </div>
                                    <div class="h-1.5 w-full bg-slate-100/50 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style="width: ${percent(used, limit)}%"></div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm font-black text-slate-700">${Number(company.aiCredits || 0).toLocaleString("en-IN")}</span>
                                        <div class="flex gap-1">
                                            <button class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center transition-colors" data-adjust-credits="${company.id}" title="Adjust AI Credits"><i class="fas fa-coins text-[10px]"></i></button>
                                            <button class="w-7 h-7 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors" data-view-credit-logs="${company.id}" title="View Credit History"><i class="fas fa-clock-rotate-left text-[10px]"></i></button>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-xs font-black text-slate-700">
                                    ${Number(company.jobPostingCredits || 0).toLocaleString("en-IN")}
                                </td>
                                <td class="px-6 py-4">${recordActions("companies", company.id)}</td>
                            </tr>
                        `;
            })
            .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function userTable(users) {
    if (!state.users.length) return empty("No users created yet.");
    if (!users.length) return empty("No users match the active filters.");
    return `
        <div class="table-wrap">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th class="px-6 py-4">User</th>
                        <th class="px-6 py-4">Company</th>
                        <th class="px-6 py-4">Role</th>
                        <th class="px-6 py-4">Status</th>
                        <th class="px-6 py-4">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${users
            .map(
                (user) => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-slate-700 text-xs font-black uppercase shadow-inner">
                                        ${escapeHtml(initials(user.name))}
                                    </div>
                                    <div>
                                        <div class="font-bold text-slate-800">${escapeHtml(user.name)}</div>
                                        <div class="text-[10px] text-slate-500 font-medium">${escapeHtml(user.email)}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-xs font-medium text-slate-500">${escapeHtml(companyName(user.companyId))}</td>
                            <td class="px-6 py-4">${badge(getAllRoles()[user.role]?.label || user.role, "info")}</td>
                            <td class="px-6 py-4">${badge(user.status || "active", statusTone(user.status))}</td>
                            <td class="px-6 py-4">${recordActions("users", user.id)}</td>
                        </tr>
                    `
            )
            .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function billingTable(records) {
    if (!records.length) return empty("No billing records found.");
    return `
        <div class="table-wrap overflow-x-auto">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th class="px-6 py-4">Company</th>
                        <th class="px-6 py-4">Type</th>
                        <th class="px-6 py-4">Amount</th>
                        <th class="px-6 py-4">Status</th>
                        <th class="px-6 py-4">Dates</th>
                        <th class="px-6 py-4">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${records
            .map(
                (record) => `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4">
                                <div class="font-bold text-slate-800">${escapeHtml(companyName(record.companyId))}</div>
                                <div class="text-[10px] text-slate-500 font-medium">${escapeHtml(record.description || "")}</div>
                            </td>
                            <td class="px-6 py-4">${badge(record.type || "invoice", record.type === "payment" ? "success" : "info")}</td>
                            <td class="px-6 py-4 font-black text-slate-700">${inr.format(record.amount || 0)}</td>
                            <td class="px-6 py-4">${badge(record.status || "pending", statusTone(record.status))}</td>
                            <td class="px-6 py-4">
                                <div class="text-xs text-slate-800 font-semibold">Inv: ${formatDate(record.invoiceDate)}</div>
                                <div class="text-[10px] text-slate-500 mt-0.5">Due: ${formatDate(record.dueDate)}</div>
                            </td>
                            <td class="px-6 py-4">${recordActions("billingRecords", record.id)}</td>
                        </tr>
                    `
            )
            .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function contactsTable(leads) {
    if (!leads.length) return empty("No website leads found.");
    return `
        <div class="table-wrap overflow-x-auto">
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th class="px-6 py-4">Name</th>
                        <th class="px-6 py-4">Email</th>
                        <th class="px-6 py-4">Company Size</th>
                        <th class="px-6 py-4">Message</th>
                        <th class="px-6 py-4">Date</th>
                        <th class="px-6 py-4">Status</th>
                        <th class="px-6 py-4">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${leads
            .map((lead) => {
                const date = lead.timestamp?.seconds ? new Date(lead.timestamp.seconds * 1000) : new Date(lead.timestamp || 0);
                const status = lead.status || "new";
                return `
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-6 py-4 font-bold text-slate-800">${escapeHtml(lead.name || "Anonymous")}</td>
                                <td class="px-6 py-4 text-xs font-semibold text-slate-600">${escapeHtml(lead.email || "")}</td>
                                <td class="px-6 py-4">${badge(lead.company_size || "Unknown", "soft")}</td>
                                <td class="px-6 py-4 text-xs text-slate-600 max-w-xs truncate" title="${escapeHtml(lead.message || "")}">${escapeHtml(lead.message || "No message")}</td>
                                <td class="px-6 py-4 text-xs font-medium text-slate-500">${formatDateTime(date)}</td>
                                <td class="px-6 py-4">${badge(status, statusTone(status))}</td>
                                <td class="px-6 py-4">
                                    <select data-contact-id="${lead.id}" class="contact-status-selector px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs focus:border-blue-500 outline-none transition-colors">
                                        <option value="new" ${status === "new" ? "selected" : ""}>New</option>
                                        <option value="contacted" ${status === "contacted" ? "selected" : ""}>Contacted</option>
                                        <option value="converted" ${status === "converted" ? "selected" : ""}>Converted</option>
                                        <option value="dismissed" ${status === "dismissed" ? "selected" : ""}>Dismissed</option>
                                    </select>
                                </td>
                            </tr>
                        `;
            })
            .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function recordActions(collectionName, id) {
    const actions = [
        recordActionButton("view", collectionName, id, "fa-eye", "View"),
        recordActionButton("edit", collectionName, id, "fa-pen", "Edit"),
        recordActionButton("delete", collectionName, id, "fa-trash", "Delete", true)
    ];

    if (collectionName === "billingRecords") {
        actions.push(recordActionButton("pdf", collectionName, id, "fa-file-pdf", "Export"));
    }

    return `<div class="flex gap-2">${actions.join("")}</div>`;
}

function recordActionButton(action, collectionName, id, icon, title, danger = false) {
    const style = danger
        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
        : "bg-slate-100/50 hover:bg-blue-500/20 hover:text-blue-400";
    return `
        <button class="w-8 h-8 rounded-lg ${style} flex items-center justify-center transition-all"
            data-record-action="${action}"
            data-collection="${collectionName}"
            data-record-id="${escapeHtml(id)}"
            title="${title}">
            <i class="fas ${icon} text-xs"></i>
        </button>
    `;
}

function companyUsageList() {
    if (!state.companies.length) return empty("No usage data yet.");
    return `<div class="grid gap-4">${state.companies
        .map((company) => {
            const used = userCount(company.id);
            const limit = Number(company.userLimit || 1);
            const p = percent(used, limit);
            const colorClass =
                p > 90
                    ? "from-rose-500 to-pink-500"
                    : p > 70
                        ? "from-amber-400 to-orange-500"
                        : "from-blue-500 to-indigo-500";
            return `
            <div class="p-4 rounded-2xl bg-white border border-slate-100 hover:shadow-md hover:border-slate-200 transition-all">
                <div class="flex justify-between items-center mb-3">
                    <strong class="text-sm font-black text-slate-800">${escapeHtml(company.companyName)}</strong>
                    <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">${used}/${limit} users</span>
                </div>
                <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r ${colorClass} transition-all duration-500" style="width: ${p}%"></div>
                </div>
            </div>
        `;
        })
        .join("")}</div>`;
}

function planCard(plan) {
    const price = plan.priceMonthly ? `${inr.format(plan.priceMonthly)}/month` : "Dynamic pricing";
    return `
        <div class="panel plan-card">
            <div>
                <h3>${plan.name}</h3>
                <div class="plan-price">${price}</div>
                <p class="muted">${plan.maxUsers ? `${plan.maxUsers} max users` : "Custom user limits"}</p>
            </div>
            <div class="plan-features">
                ${plan.features.map((feature) => `<span><i class="fas fa-check"></i> ${featureLabel(feature)}</span>`).join("")}
            </div>
        </div>
    `;
}

function metric(label, value, icon, color = "blue") {
    const colors = {
        blue: "from-blue-500 to-indigo-500 shadow-blue-500/20 text-blue-50",
        emerald: "from-emerald-400 to-teal-500 shadow-emerald-500/20 text-emerald-50",
        amber: "from-amber-400 to-orange-400 shadow-amber-500/20 text-amber-50",
        indigo: "from-indigo-500 to-violet-500 shadow-indigo-500/20 text-indigo-50",
        rose: "from-rose-400 to-pink-500 shadow-rose-500/20 text-rose-50"
    };

    const selected = colors[color] || colors.blue;

    return `
        <div class="bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-6 group hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-300 relative overflow-hidden">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br ${selected.split(" ").slice(0, 2).join(" ")} flex items-center justify-center text-slate-900 text-xl shadow-lg ${selected.split(" ")[2]} group-hover:scale-110 transition-transform">
                <i class="fas ${icon}"></i>
            </div>
            <div>
                <div class="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">${label}</div>
                <div class="text-3xl font-black text-slate-900">${value}</div>
            </div>
        </div>
    `;
}

function domainItem(title, value) {
    return `
        <div class="p-4 rounded-xl bg-slate-100/50 border border-slate-200 flex justify-between items-center group hover:bg-white/10 transition-all">
            <strong class="text-sm font-bold">${escapeHtml(title)}</strong>
            <span class="text-xs text-slate-500 font-medium">${escapeHtml(value)}</span>
        </div>
    `;
}

function badge(text, tone = "soft") {
    const tones = {
        success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        soft: "bg-slate-500/10 text-slate-500 border-slate-500/20"
    };

    const cls = tones[tone] || tones.soft;
    return `<span class="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${cls}">${escapeHtml(text)}</span>`;
}

function empty(message) {
    return `<div class="flex flex-col items-center justify-center p-12 text-slate-400 text-sm font-bold border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 m-6"><i class="fas fa-folder-open text-4xl mb-4 text-slate-300"></i>${escapeHtml(message)}</div>`;
}

function statusTone(status = "") {
    if (["active", "accepted", "payment_received", "owner_confirmed", "completed"].includes(status)) return "success";
    if (["trialing", "grace", "invited", "pending", "pending_payment", "not_started"].includes(status))
        return "warning";
    if (["suspended", "cancelled", "expired", "past_due", "disabled", "halted", "payment_failed"].includes(status))
        return "danger";
    return "soft";
}

function userCount(companyId) {
    return state.users.filter((user) => user.companyId === companyId && user.status !== "disabled").length;
}

function companyName(companyId) {
    return state.companies.find((company) => company.id === companyId)?.companyName || "Unknown company";
}

function selectedCompany() {
    return state.session?.company || state.companies[0] || null;
}

function selectedSubscription(company) {
    return (
        state.session?.subscription ||
        state.subscriptions.find((sub) => sub.id === company?.subscriptionId) ||
        state.subscriptions[0] ||
        null
    );
}

function planName(planId) {
    return PLAN_CATALOG[planId]?.name || "Custom";
}

function featureLabel(featureKey) {
    return FEATURES[featureKey]?.label || featureKey;
}

function primaryActionLabel() {
    if (state.view === "companies") return "Create Company";
    if (state.view === "users") return "Invite User";
    if (state.view === "roles") return "Assign Role";
    if (state.view === "billing") return "Create Record";
    if (state.view === "emails") return "Add Email";
    return "New Record";
}

window.WorkCosmoAccess = {
    hasPermission,
    canAddUser,
    canAccessModule,
    getCompanyUsers
};

function showCompanyModal() {
    openModal({
        title: "Create Company Workspace",
        submitLabel: "Provision Workspace",
        content: `
            <div class="grid gap-1.5">
                <label for="companyName" class="text-sm font-bold text-slate-700">Company Name</label>
                <input id="companyName" required placeholder="e.g. Udaan Talent Partners" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid gap-1.5">
                <label for="companySubdomain" class="text-sm font-bold text-slate-700">Client ID / Subdomain</label>
                <input id="companySubdomain" required placeholder="e.g. udaan-talent" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid gap-4 grid-cols-2 mt-2">
                <div class="grid gap-1.5">
                    <label for="userLimit" class="text-sm font-bold text-slate-700">User Limit</label>
                    <input id="userLimit" type="number" min="1" value="5" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                </div>
                <div class="grid gap-1.5">
                    <label for="aiCredits" class="text-sm font-bold text-slate-700">AI Credits</label>
                    <input id="aiCredits" type="number" min="0" value="50000" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                </div>
            </div>
            <div class="grid gap-4 grid-cols-2 mt-2">
                <div class="grid gap-1.5">
                    <label for="jobPostingCredits" class="text-sm font-bold text-slate-700">Job Posting Credits</label>
                    <input id="jobPostingCredits" type="number" min="0" value="10" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                </div>
                <div class="grid gap-1.5">
                    <label for="pricing" class="text-sm font-bold text-slate-700">Pricing</label>
                    <input id="pricing" placeholder="e.g. ₹2999/mo" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                </div>
            </div>
            <div class="grid gap-1.5 mt-2">
                <label for="billingCycle" class="text-sm font-bold text-slate-700">Billing Cycle</label>
                <select id="billingCycle" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                </select>
            </div>
            <div class="grid gap-1.5 mt-2">
                <label for="ownerName" class="text-sm font-bold text-slate-700">Owner Name</label>
                <input id="ownerName" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid gap-1.5">
                <label for="ownerEmail" class="text-sm font-bold text-slate-700">Owner Email</label>
                <input id="ownerEmail" type="email" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
        `,
        onSubmit: async (e, form, close) => {
            const companySubdomain = getClientId(document.getElementById("companySubdomain").value);
            if (!companySubdomain) {
                toast("Enter a valid client ID / subdomain.", true);
                return;
            }

            const ownerEmail = document.getElementById("ownerEmail").value.trim();
            const ownerName = document.getElementById("ownerName").value.trim();
            const tempPassword = "WorkCosmo@2026!";

            let firebaseUser;
            try {
                toast("Creating secure login credentials...", false);
                const authCredential = await createUserWithEmailAndPassword(secondaryAuth, ownerEmail, tempPassword);
                firebaseUser = authCredential.user;
            } catch (authError) {
                if (authError.code === "auth/email-already-in-use") {
                    const uid = prompt(
                        "An authentication account with this email already exists.\nIf you want to link to their existing account, enter their Firebase UID below (or click Cancel):"
                    );
                    if (!uid) {
                        toast("Provisioning cancelled.", true);
                        return;
                    }
                    firebaseUser = { uid, email: ownerEmail };
                } else {
                    console.error("Auth Creation Error:", authError);
                    toast("Failed to create Auth user: " + authError.message, true);
                    return;
                }
            }

            const companyId = await createCompanyWorkspace({
                companyId: companySubdomain,
                companyName: document.getElementById("companyName").value.trim(),
                userLimit: Number(document.getElementById("userLimit").value || 1),
                aiCredits: Number(document.getElementById("aiCredits").value || 0),
                jobPostingCredits: Number(document.getElementById("jobPostingCredits").value || 0),
                pricing: document.getElementById("pricing").value.trim(),
                billingCycle: document.getElementById("billingCycle").value,
                ownerId: firebaseUser.uid,
                ownerName: ownerName,
                ownerEmail: ownerEmail
            });

            await loadData();
            renderShell();

            const credentialsText = `Space URL: https://space.workcosmo.in\nClient ID: ${companySubdomain}\nHire URL: https://hire.workcosmo.in/${companySubdomain}\nAdmin Email: ${ownerEmail}\nDefault Password: ${tempPassword}`;
            navigator.clipboard?.writeText(credentialsText);
            alert(
                `🎉 Workspace Provisioned Successfully!\n\nCredentials have been COPIED to your clipboard:\n\n${credentialsText}\n\nYou can now paste this directly into an email to your client.`
            );
            close();
        }
    });

    // Auto-fill subdomain logic inside modal
    setTimeout(() => {
        const cName = document.getElementById("companyName");
        const cSub = document.getElementById("companySubdomain");
        if (cName && cSub) {
            cName.addEventListener("input", () => {
                if (!cSub.value || cSub.value === getClientId(cName.value.slice(0, -1))) {
                    cSub.value = getClientId(cName.value);
                }
            });
        }
    }, 100);
}

function showUserModal() {
    openModal({
        title: "Invite User",
        submitLabel: "Create Login Profile",
        content: `
            <div class="grid gap-1.5">
                <label for="userCompany" class="text-sm font-bold text-slate-700">Company</label>
                <select id="userCompany" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                    <option value="">Select company</option>
                    ${state.companies.map((company) => `<option value="${company.id}">${escapeHtml(company.companyName)} - ${userCount(company.id)}/${company.userLimit || 1}</option>`).join("")}
                </select>
            </div>
            <div class="grid gap-1.5">
                <label for="inviteName" class="text-sm font-bold text-slate-700">User Name</label>
                <input id="inviteName" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid gap-1.5">
                <label for="inviteEmail" class="text-sm font-bold text-slate-700">Email</label>
                <input id="inviteEmail" type="email" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid gap-1.5">
                <label for="inviteRole" class="text-sm font-bold text-slate-700">Role</label>
                <select id="inviteRole" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                    ${Object.values(getAllRoles())
                .map((role) => `<option value="${role.id}">${role.label}</option>`)
                .join("")}
                </select>
            </div>
        `,
        onSubmit: async (e, form, close) => {
            const company = state.companies.find((item) => item.id === document.getElementById("userCompany").value);
            const activeUserCount = userCount(company.id);
            const check = canAddUser(company, activeUserCount);
            if (!check.allowed) {
                toast(check.reason, true);
                return;
            }

            const inviteEmail = document.getElementById("inviteEmail").value.trim();
            const inviteName = document.getElementById("inviteName").value.trim();
            const inviteRole = document.getElementById("inviteRole").value;
            const tempPassword = "WorkCosmo@2026!";

            let firebaseUser;
            try {
                toast("Creating secure login credentials...", false);
                const authCredential = await createUserWithEmailAndPassword(secondaryAuth, inviteEmail, tempPassword);
                firebaseUser = authCredential.user;
            } catch (authError) {
                if (authError.code === "auth/email-already-in-use") {
                    const uid = prompt(
                        "An authentication account with this email already exists.\nIf you want to link to their existing account, enter their Firebase UID below (or click Cancel):"
                    );
                    if (!uid) {
                        toast("Provisioning cancelled.", true);
                        return;
                    }
                    firebaseUser = { uid, email: inviteEmail };
                } else {
                    console.error("Auth Creation Error:", authError);
                    toast("Failed to create Auth user: " + authError.message, true);
                    return;
                }
            }

            await inviteUser({
                company,
                activeUserCount,
                userId: firebaseUser.uid,
                name: inviteName,
                email: inviteEmail,
                role: inviteRole
            });
            await loadData();
            renderShell();

            const credentialsText = `Space URL: https://space.workcosmo.in\nClient ID: ${company.id}\nEmail: ${inviteEmail}\nDefault Password: ${tempPassword}`;
            navigator.clipboard?.writeText(credentialsText);
            alert(
                `🎉 Login Profile Created Successfully!\n\nCredentials have been COPIED to your clipboard:\n\n${credentialsText}\n\nYou can now share this directly with the user.`
            );
            close();
        }
    });
}

function showBillingModal(record = null) {
    const isEdit = Boolean(record?.id);
    const title = isEdit ? "Edit Billing Entry" : "Create Billing Entry";
    const submitLabel = isEdit ? "Save Changes" : "Save Record";
    const invoiceDate = record?.invoiceDate ? record.invoiceDate.split("T")[0] : "";
    const dueDate = record?.dueDate ? record.dueDate.split("T")[0] : "";

    openModal({
        title,
        submitLabel,
        content: `
            <div class="grid gap-1.5">
                <label for="billingCompanyId" class="text-sm font-bold text-slate-700">Company</label>
                <select id="billingCompanyId" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                    <option value="">Select company</option>
                    ${state.companies
                        .map((company) => `
                            <option value="${company.id}" ${record?.companyId === company.id ? "selected" : ""}>
                                ${escapeHtml(company.companyName)}
                            </option>`)
                        .join("")}
                </select>
            </div>
            <div class="grid gap-1.5">
                <label for="billingType" class="text-sm font-bold text-slate-700">Record Type</label>
                <select id="billingType" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                    <option value="invoice" ${record?.type === "invoice" ? "selected" : ""}>Invoice</option>
                    <option value="payment" ${record?.type === "payment" ? "selected" : ""}>Payment Receipt</option>
                </select>
            </div>
            <div class="grid gap-1.5">
                <label for="billingAmount" class="text-sm font-bold text-slate-700">Amount (INR)</label>
                <input id="billingAmount" type="number" required min="0" value="${record?.amount ?? ""}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid gap-1.5">
                <label for="billingDescription" class="text-sm font-bold text-slate-700">Description</label>
                <input id="billingDescription" type="text" placeholder="e.g. Monthly subscription fee" required value="${escapeHtml(record?.description || "")}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="grid gap-1.5">
                    <label for="billingInvoiceDate" class="text-sm font-bold text-slate-700">Invoice Date</label>
                    <input id="billingInvoiceDate" type="date" required value="${invoiceDate}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                </div>
                <div class="grid gap-1.5">
                    <label for="billingDueDate" class="text-sm font-bold text-slate-700">Due Date</label>
                    <input id="billingDueDate" type="date" required value="${dueDate}" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                </div>
            </div>
            <div class="grid gap-1.5">
                <label for="billingStatus" class="text-sm font-bold text-slate-700">Status</label>
                <select id="billingStatus" required class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                    <option value="pending" ${record?.status === "pending" ? "selected" : ""}>Pending</option>
                    <option value="paid" ${record?.status === "paid" ? "selected" : ""}>Paid</option>
                    <option value="overdue" ${record?.status === "overdue" ? "selected" : ""}>Overdue</option>
                    <option value="cancelled" ${record?.status === "cancelled" ? "selected" : ""}>Cancelled</option>
                </select>
            </div>
        `,
        onSubmit: async (_e, _form, close) => {
            const payload = {
                companyId: document.getElementById("billingCompanyId").value,
                type: document.getElementById("billingType").value,
                amount: Number(document.getElementById("billingAmount").value || 0),
                description: document.getElementById("billingDescription").value.trim(),
                invoiceDate: document.getElementById("billingInvoiceDate").value,
                dueDate: document.getElementById("billingDueDate").value,
                status: document.getElementById("billingStatus").value
            };

            if (isEdit) {
                await updateBillingRecord(record.id, payload);
                toast("Billing record updated.");
            } else {
                await createBillingRecord(payload);
                toast("Billing record created.");
            }

            await loadData();
            renderShell();
            close();
        }
    });
}

function showBillingRecordView(record) {
    openModal({
        title: `Billing Record: ${record.id}`,
        isForm: false,
        cancelLabel: "Close",
        content: `
            <div class="grid gap-4">
                <div class="grid gap-1.5">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Company</div>
                    <div class="text-sm font-black text-slate-800">${escapeHtml(companyName(record.companyId))}</div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="grid gap-1.5">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Type</div>
                        <div>${badge(record.type || "invoice", record.type === "payment" ? "success" : "info")}</div>
                    </div>
                    <div class="grid gap-1.5">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Amount</div>
                        <div class="text-sm font-black text-slate-800">${inr.format(record.amount || 0)}</div>
                    </div>
                </div>
                <div class="grid gap-1.5">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Status</div>
                    <div>${badge(record.status || "pending", statusTone(record.status))}</div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="grid gap-1.5">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Invoice Date</div>
                        <div>${formatDate(record.invoiceDate)}</div>
                    </div>
                    <div class="grid gap-1.5">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Due Date</div>
                        <div>${formatDate(record.dueDate)}</div>
                    </div>
                </div>
                <div class="grid gap-1.5">
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Description</div>
                    <div class="text-sm text-slate-700">${escapeHtml(record.description || "No description")}</div>
                </div>
            </div>
        `
    });
}

function downloadBillingInvoiceAsPdf(record) {
    const companyLabel = escapeHtml(companyName(record.companyId));
    const invoiceDate = formatDate(record.invoiceDate);
    const dueDate = formatDate(record.dueDate);
    const statusLabel = escapeHtml(record.status || "pending");
    const typeLabel = escapeHtml(record.type || "invoice");
    const amountLabel = inr.format(record.amount || 0);
    const description = escapeHtml(record.description || "Service fee") + ".";

    const invoiceHtml = `<!doctype html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <title>Invoice ${record.id}</title>
        <style>
            body { margin: 0; padding: 0; background: #f4f6fb; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; }
            .page { width: 100%; min-height: 100vh; padding: 40px; box-sizing: border-box; }
            .invoice-shell { max-width: 900px; margin: auto; background: #ffffff; border-radius: 28px; overflow: hidden; box-shadow: 0 30px 80px rgba(15, 23, 42, 0.12); }
            .brand-bar { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 32px 40px; background: linear-gradient(135deg, #3b82f6 0%, #ec4899 100%); color: #ffffff; }
            .brand-bar .brand { display: flex; align-items: center; gap: 16px; }
            .brand-icon { width: 52px; height: 52px; border-radius: 18px; background: rgba(255,255,255,0.2); display: grid; place-items: center; font-size: 1.35rem; font-weight: 800; }
            .brand-title { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.03em; margin: 0; }
            .brand-subtitle { margin: 4px 0 0; color: rgba(255,255,255,0.85); font-size: 0.95rem; }
            .headline { display: grid; grid-template-columns: 1fr auto; gap: 24px; padding: 32px 40px; }
            .headline h1 { margin: 0; font-size: 2rem; letter-spacing: -0.04em; }
            .headline p { margin: 8px 0 0; color: #475569; }
            .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 24px; }
            .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 20px; }
            .meta-card span { display: block; color: #94a3b8; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
            .meta-card strong { display: block; font-size: 1.05rem; color: #0f172a; }
            .invoice-content { padding: 0 40px 40px; }
            .section { margin-bottom: 28px; }
            .section-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
            .section-title h2 { margin: 0; font-size: 1rem; letter-spacing: 0.05em; text-transform: uppercase; color: #475569; }
            .badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 8px 14px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
            .badge.pending { background: #f8fafc; color: #2563eb; }
            .badge.paid { background: #ecfdf5; color: #047857; }
            .badge.overdue { background: #fee2e2; color: #b91c1c; }
            .badge.cancelled { background: #f8fafc; color: #6b7280; }
            .table { width: 100%; border-collapse: collapse; }
            .table th, .table td { padding: 18px 16px; text-align: left; }
            .table thead th { color: #64748b; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #e2e8f0; }
            .table tbody tr { border-bottom: 1px solid #e2e8f0; }
            .table tbody tr:last-child { border-bottom: none; }
            .table td.description { color: #334155; }
            .table td.amount { font-weight: 800; color: #0f172a; }
            .total-row td { border-top: 2px solid #e2e8f0; }
            .footer { padding: 0 40px 40px; color: #64748b; font-size: 0.92rem; line-height: 1.7; }
            .footer .note { margin-top: 12px; }
            .logo-line { color: #ffffff; opacity: 0.9; font-size: 0.9rem; }
        </style>
    </head>
    <body>
        <div class="page">
            <div class="invoice-shell">
                <div class="brand-bar">
                    <div class="brand">
                        <div class="brand-icon">WC</div>
                        <div>
                            <div class="brand-title">Work Cosmo</div>
                            <div class="brand-subtitle">Access Control Billing Center</div>
                        </div>
                    </div>
                    <div class="logo-line">www.workcosmo.in</div>
                </div>
                <div class="headline">
                    <div>
                        <h1>Invoice</h1>
                        <p>Professional invoice generated for manual billing and payment tracking.</p>
                    </div>
                    <div class="badge ${record.status || "pending"}">${statusLabel}</div>
                </div>
                <div class="invoice-content">
                    <div class="meta-grid">
                        <div class="meta-card">
                            <span>Invoice Number</span>
                            <strong>${escapeHtml(record.id)}</strong>
                        </div>
                        <div class="meta-card">
                            <span>Invoice Date</span>
                            <strong>${invoiceDate}</strong>
                        </div>
                        <div class="meta-card">
                            <span>Due Date</span>
                            <strong>${dueDate}</strong>
                        </div>
                        <div class="meta-card">
                            <span>Type</span>
                            <strong>${typeLabel}</strong>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">
                            <h2>Billed To</h2>
                        </div>
                        <div style="display:flex; align-items:flex-start; gap:24px;">
                            <div>
                                <div style="font-weight: 700; color: #0f172a; font-size: 1rem;">${companyLabel}</div>
                                <div style="margin-top: 8px; color: #475569;">Billing entry generated from the access control dashboard.</div>
                            </div>
                            <div style="min-width: 220px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 18px; padding: 16px;">
                                <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Invoice Summary</div>
                                <div style="font-size: 1.8rem; font-weight: 800; color: #0f172a;">${amountLabel}</div>
                                <div style="margin-top: 8px; color: #475569;">Due by ${dueDate}</div>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">
                            <h2>Details</h2>
                        </div>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Description</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="description">${description}</td>
                                    <td class="amount">${amountLabel}</td>
                                </tr>
                                <tr class="total-row">
                                    <td style="font-weight:700;">Total</td>
                                    <td class="amount">${amountLabel}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="footer">
                    <div>Thank you for choosing Work Cosmo. If you have any questions about this invoice, reach out to support@workcosmo.in.</div>
                    <div class="note">Please retain this document for your records.</div>
                </div>
            </div>
        </div>
    </body>
    </html>`;

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
        toast("Popup blocked. Allow popups to view invoice.", true);
        return;
    }

    printWindow.document.write(invoiceHtml);
    printWindow.document.close();
    printWindow.focus();
}

function showRoleModal() {
    openModal({
        title: "Assign Member Role",
        submitLabel: "Update Permissions",
        content: `
            <div class="grid gap-1.5">
                <label class="text-sm font-bold text-slate-700">Select User</label>
                <select id="roleUser" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" required>
                    <option value="">Select a member...</option>
                    ${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)} (${escapeHtml(user.email)})</option>`).join("")}
                </select>
            </div>
            <div class="grid gap-1.5 mt-2">
                <label class="text-sm font-bold text-slate-700">Target Role</label>
                <div class="grid grid-cols-2 gap-3">
                    ${Object.values(getAllRoles())
                .map(
                    (role) => `
                        <label class="relative flex flex-col p-4 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:border-pink-300 hover:bg-white hover:shadow-md transition-all has-[:checked]:border-pink-500 has-[:checked]:bg-white has-[:checked]:ring-4 has-[:checked]:ring-pink-500/10">
                            <input type="radio" name="roleValue" value="${role.id}" class="sr-only" required>
                            <span class="text-sm font-bold text-slate-800">${role.label}</span>
                            <span class="text-[10px] text-slate-500 font-medium mt-1">${role.permissions.length} Permissions</span>
                        </label>
                    `
                )
                .join("")}
                </div>
            </div>
        `,
        onSubmit: async (e, form, close) => {
            const userId = document.getElementById("roleUser").value;
            const role = document.querySelector('input[name="roleValue"]:checked').value;
            await assignRole(userId, role);
            await loadData();
            renderShell();
            toast("Role assigned successfully.");
            close();
        }
    });
}

async function handleCustomRoleSubmit(event) {
    event.preventDefault();
    const label = document.getElementById("customRoleLabel").value.trim();
    const permsInputs = document.querySelectorAll('input[name="customRolePerms"]:checked');
    const permissions = Array.from(permsInputs).map((input) => input.value);

    if (!label) {
        toast("Role label is required.", true);
        return;
    }

    try {
        if (state.editingRoleId) {
            await updateCustomRole(state.editingRoleId, {
                label,
                permissions
            });
            state.editingRoleId = null;
            toast("Role updated successfully.");
        } else {
            const roleId = "custom_" + label.toLowerCase().replace(/[^a-z0-9]/g, "_");
            if (getAllRoles()[roleId]) {
                toast(`Role ID "${roleId}" is already in use. Please choose a different label.`, true);
                return;
            }
            await createCustomRole("global", {
                label,
                permissions
            });
            toast("Role created successfully.");
        }
        await loadData();
        renderShell();
    } catch (error) {
        console.error(error);
        toast(error.message, true);
    }
}

function handleEditRoleClick(docId) {
    const role = Object.values(DYNAMIC_ROLES).find((r) => r.docId === docId);
    if (role) {
        state.editingRoleId = docId;
        renderShell();

        // Populate form fields after rendering
        document.getElementById("customRoleLabel").value = role.label;
        const perms = role.permissions;
        document.querySelectorAll('input[name="customRolePerms"]').forEach((checkbox) => {
            checkbox.checked = perms.includes(checkbox.value);
        });
    }
}

async function handleDeleteRoleClick(docId) {
    if (
        confirm(
            "Are you sure you want to delete this custom role? Users assigned to this role may lose access permissions."
        )
    ) {
        try {
            await deleteRecord("roles", docId);
            toast("Role deleted successfully.");
            if (state.editingRoleId === docId) {
                state.editingRoleId = null;
            }
            await loadData();
            renderShell();
        } catch (error) {
            console.error(error);
            toast(error.message, true);
        }
    }
}

function showAiCreditsModal(companyId) {
    const company = state.companies.find((c) => c.id === companyId);
    if (!company) {
        toast("Company not found.", true);
        return;
    }
    const currentCredits = Number(company.aiCreditsRemaining || 0);

    openModal({
        title: `Adjust AI Credits — ${company.companyName}`,
        submitLabel: "Apply Credit Change",
        content: `
            <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 mb-4">
                <div class="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1">Current Balance</div>
                <div class="text-3xl font-black text-indigo-700">${currentCredits.toLocaleString("en-IN")}</div>
                <div class="text-xs text-indigo-400 font-medium mt-1">AI credits remaining</div>
            </div>
            <div class="grid gap-1.5">
                <label for="creditAction" class="text-sm font-bold text-slate-700">Action</label>
                <select id="creditAction" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all">
                    <option value="add">Add Credits (Top-up)</option>
                    <option value="set">Set to Exact Value</option>
                    <option value="deduct">Deduct Credits</option>
                </select>
            </div>
            <div class="grid gap-1.5 mt-4">
                <label for="creditAmount" class="text-sm font-bold text-slate-700">Amount</label>
                <input id="creditAmount" type="number" min="0" required value="10000" placeholder="Number of credits" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" />
            </div>
            <div class="grid gap-1.5 mt-4">
                <label for="creditReason" class="text-sm font-bold text-slate-700">Reason (optional)</label>
                <input id="creditReason" type="text" placeholder="e.g. Monthly top-up, bonus credits" class="w-full min-h-[42px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all" />
            </div>
        `,
        onSubmit: async (_e, _form, close) => {
            const action = document.getElementById("creditAction").value;
            const amount = Number(document.getElementById("creditAmount").value || 0);
            const reason = document.getElementById("creditReason").value.trim();

            if (amount < 0 || isNaN(amount)) {
                toast("Enter a valid positive number.", true);
                return;
            }

            let newBalance;
            if (action === "add") {
                newBalance = currentCredits + amount;
            } else if (action === "set") {
                newBalance = amount;
            } else if (action === "deduct") {
                newBalance = Math.max(0, currentCredits - amount);
            }

            await updateRecord("companies", companyId, {
                aiCreditsRemaining: newBalance
            });

            // Also log the adjustment in an activity record
            try {
                await createRecord("activityLogs", {
                    companyId,
                    type: "ai_credit_adjustment",
                    action,
                    amount,
                    previousBalance: currentCredits,
                    newBalance,
                    reason: reason || `AI credit ${action}`,
                    performedBy: state.session.user?.email || "platform_admin",
                    createdAt: new Date().toISOString()
                });
            } catch (logError) {
                console.warn("Activity log write skipped:", logError);
            }

            // Sync subscription too if it exists
            if (company.subscriptionId) {
                try {
                    await updateRecord("subscriptions", company.subscriptionId, {
                        aiCreditsRemaining: newBalance
                    });
                } catch (subError) {
                    console.warn("Subscription credit sync skipped:", subError);
                }
            }

            await loadData();
            renderShell();
            toast(
                `AI credits updated: ${currentCredits.toLocaleString("en-IN")} → ${newBalance.toLocaleString("en-IN")}`
            );
            close();
        }
    });
}

async function showAiCreditsHistoryModal(companyId) {
    const company = state.companies.find((c) => c.id === companyId);
    if (!company) {
        toast("Company not found.", true);
        return;
    }

    openModal({
        title: `Credit History — ${company.companyName}`,
        cancelLabel: "Close",
        isForm: false,
        onSubmit: null,
        content: `
            <div id="credit-logs-timeline-container" class="py-2">
                <div class="flex flex-col items-center justify-center py-12 text-center">
                    <div class="w-10 h-10 rounded-full bg-slate-50 text-indigo-500 flex items-center justify-center animate-spin mb-4">
                        <i class="fas fa-circle-notch text-xl animate-spin"></i>
                    </div>
                    <span class="text-xs text-slate-500 font-medium font-sans">Fetching historical ledger...</span>
                </div>
            </div>
        `
    });

    const container = document.getElementById("credit-logs-timeline-container");
    if (container) {
        try {
            const logs = await listByCompany("activityLogs", companyId, "createdAt");
            const creditLogs = logs.filter((log) => log.type === "ai_credit_adjustment");
            if (creditLogs.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-8 text-center animate-fade-in">
                        <div class="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center text-xl mb-4">
                            <i class="fas fa-history"></i>
                        </div>
                        <h4 class="text-sm font-bold text-slate-800">No Adjustment History</h4>
                        <p class="text-xs text-slate-500 max-w-xs mt-1">This company workspace hasn't had any manual AI credit adjustments yet.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="relative border-l-2 border-slate-100 pl-6 ml-3 space-y-6 animate-fade-in">
                    ${creditLogs
                    .map((log) => {
                        let badgeColor = "bg-indigo-50 text-indigo-700 border-indigo-100";
                        let actionLabel = "Set to";
                        let icon = "fa-equals";
                        if (log.action === "add") {
                            badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
                            actionLabel = "Added";
                            icon = "fa-plus";
                        } else if (log.action === "deduct") {
                            badgeColor = "bg-rose-50 text-rose-700 border-rose-100";
                            actionLabel = "Deducted";
                            icon = "fa-minus";
                        }

                        return `
                            <div class="relative group">
                                <div class="absolute -left-[35px] top-1 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[9px] text-slate-500 transition-colors group-hover:border-indigo-400 group-hover:text-indigo-600">
                                    <i class="fas ${icon}"></i>
                                </div>
                                
                                <div>
                                    <div class="flex items-center justify-between gap-4">
                                        <div class="flex items-center gap-2">
                                            <span class="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${badgeColor}">
                                                ${actionLabel} ${Number(log.amount || 0).toLocaleString("en-IN")}
                                            </span>
                                        </div>
                                        <span class="text-[10px] text-slate-400 font-medium">${formatDateTime(log.createdAt)}</span>
                                    </div>
                                    <div class="mt-1.5 text-xs font-bold text-slate-800 leading-relaxed">
                                        ${escapeHtml(log.reason || "AI credit modification")}
                                    </div>
                                    <div class="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                                        <i class="fas fa-user-shield text-[8px]"></i>
                                        <span>Admin: ${escapeHtml(log.performedBy || "unknown")}</span>
                                        <span class="text-slate-300">•</span>
                                        <span>Balance: ${Number(log.previousBalance || 0).toLocaleString("en-IN")} → ${Number(log.newBalance || 0).toLocaleString("en-IN")}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    })
                    .join("")}
                </div>
            `;
        } catch (error) {
            container.innerHTML = `
                <div class="p-4 rounded-xl bg-red-50 text-red-700 text-xs border border-red-100 flex items-center gap-2">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>Failed to load adjustment history: ${escapeHtml(error.message)}</span>
                </div>
            `;
        }
    }
}
