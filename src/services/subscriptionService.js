import { PLAN_CATALOG, resolvePlanLimits } from "../config/plans.js";
import { createRecord, updateRecord } from "./firestoreService.js";

export async function createSubscription(input) {
    const plan = PLAN_CATALOG[input.plan] || PLAN_CATALOG.starter;
    const customLimits =
        input.plan === "custom"
            ? {
                  maxUsers: Number(input.maxUsers || 1),
                  priceMonthly: Number(input.priceMonthly || 0)
              }
            : {};

    const limits = resolvePlanLimits({
        plan: plan.id,
        customLimits,
        customFeatures: input.features
    });

    return createRecord("subscriptions", {
        subscriptionId: input.subscriptionId || `sub_${crypto.randomUUID()}`,
        purchaseRequestId: input.purchaseRequestId || "",
        firebaseUid: input.firebaseUid || "",
        razorpayCustomerId: input.razorpayCustomerId || "",
        razorpaySubscriptionId: input.razorpaySubscriptionId || "",
        razorpayPlanId: input.razorpayPlanId || "",
        customerName: input.customerName,
        customerEmail: input.customerEmail.toLowerCase(),
        billingEmail: input.billingEmail?.toLowerCase() || input.customerEmail.toLowerCase(),
        companyName: input.companyName || "",
        plan: plan.id,
        priceMonthly: limits.priceMonthly,
        maxUsers: limits.maxUsers,
        customLimits,
        customFeatures: limits.features,
        status: input.status || "trialing",
        trialEndsAt: input.trialEndsAt || null,
        currentPeriodStart: input.currentPeriodStart || new Date().toISOString(),
        currentPeriodEnd: input.currentPeriodEnd || null,
        gracePeriodDays: Number(input.gracePeriodDays || 7),
        cancelAtPeriodEnd: false,
        lastPaymentStatus: input.lastPaymentStatus || "not_started",
        manuallyConfirmedBy: input.manuallyConfirmedBy || "",
        manuallyConfirmedAt: input.manuallyConfirmedAt || null,
        aiCreditsIncluded: Number(input.aiCreditsIncluded || 0),
        aiCreditsRemaining: Number(input.aiCreditsIncluded || 0)
    });
}

export async function upgradePlan(subscriptionId, targetPlan) {
    const plan = PLAN_CATALOG[targetPlan];
    if (!plan) throw new Error("Unknown upgrade plan.");
    await updateRecord("subscriptions", subscriptionId, {
        plan: plan.id,
        maxUsers: plan.maxUsers,
        priceMonthly: plan.priceMonthly,
        customLimits: {},
        customFeatures: plan.features,
        status: "active",
        pendingPlanChange: null
    });
}

export async function scheduleDowngrade(subscriptionId, targetPlan) {
    const plan = PLAN_CATALOG[targetPlan];
    if (!plan) throw new Error("Unknown downgrade plan.");
    await updateRecord("subscriptions", subscriptionId, {
        pendingPlanChange: {
            plan: plan.id,
            effectiveAt: "period_end",
            requestedAt: new Date().toISOString()
        }
    });
}

export async function cancelSubscription(subscriptionId) {
    await updateRecord("subscriptions", subscriptionId, {
        cancelAtPeriodEnd: true,
        status: "cancelled"
    });
}

export async function syncWebhookSubscription(subscriptionId, event) {
    const normalizedStatus = normalizeRazorpayStatus(event.status);
    await updateRecord("subscriptions", subscriptionId, {
        status: normalizedStatus,
        razorpaySubscriptionId: event.razorpaySubscriptionId,
        currentPeriodStart: event.currentPeriodStart,
        currentPeriodEnd: event.currentPeriodEnd,
        lastPaymentStatus: event.paymentStatus || "unknown",
        webhookSyncedAt: new Date().toISOString()
    });
}

function normalizeRazorpayStatus(status = "") {
    const value = status.toLowerCase();
    if (["active", "authenticated"].includes(value)) return "active";
    if (["created"].includes(value)) return "trialing";
    if (["pending", "halted"].includes(value)) return "grace";
    if (["cancelled", "completed"].includes(value)) return "cancelled";
    return "past_due";
}
