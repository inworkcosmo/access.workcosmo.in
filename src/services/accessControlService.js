import { MODULE_REQUIREMENTS, getRole } from "../config/rbac.js";
import { resolvePlanLimits, SUBSCRIPTION_STATUSES } from "../config/plans.js";

const ACTIVE_STATUSES = new Set([
    SUBSCRIPTION_STATUSES.trialing,
    SUBSCRIPTION_STATUSES.active,
    SUBSCRIPTION_STATUSES.grace
]);

export function hasPermission(user, permission) {
    if (!user || user.status !== "active") return false;
    const role = getRole(user.role);
    return role.permissions.includes("full_access") || role.permissions.includes(permission);
}

export function hasFeature(company, subscription, featureKey) {
    if (!company || company.status !== "active") return false;
    if (!isSubscriptionUsable(subscription)) return false;
    const limits = resolvePlanLimits(subscription, company);
    return limits.features.includes(featureKey);
}

export function canAccessModule(user, company, subscription, moduleKey) {
    if (!hasFeature(company, subscription, moduleKey)) return false;
    const acceptedPermissions = MODULE_REQUIREMENTS[moduleKey] || [];
    return acceptedPermissions.some((permission) => hasPermission(user, permission));
}

export function canAddUser(company, subscription, activeUserCount) {
    if (!company || company.status !== "active") {
        return { allowed: false, reason: "Company is not active." };
    }

    if (!isSubscriptionUsable(subscription)) {
        return { allowed: false, reason: "Subscription is not active." };
    }

    const { maxUsers } = resolvePlanLimits(subscription, company);
    if (activeUserCount >= maxUsers) {
        return { allowed: false, reason: `User limit reached: ${activeUserCount}/${maxUsers}.` };
    }

    return { allowed: true, reason: "User can be added." };
}

export function isSubscriptionUsable(subscription) {
    if (!subscription) return false;
    if (!ACTIVE_STATUSES.has(subscription.status)) return false;

    const expiry = subscription.currentPeriodEnd || subscription.trialEndsAt || subscription.expiresAt;
    if (!expiry) return true;

    const expiryDate = expiry.seconds ? new Date(expiry.seconds * 1000) : new Date(expiry);
    if (Number.isNaN(expiryDate.getTime())) return true;

    const graceDays = Number(subscription.gracePeriodDays || 0);
    const accessUntil = new Date(expiryDate);
    accessUntil.setDate(accessUntil.getDate() + graceDays);

    return accessUntil >= new Date();
}

export function getBlockedReason(subscription) {
    if (!subscription) return "No subscription is linked to this company.";
    if (!ACTIVE_STATUSES.has(subscription.status)) return `Subscription status is ${subscription.status}.`;
    if (!isSubscriptionUsable(subscription)) return "Subscription period has expired.";
    return "";
}
