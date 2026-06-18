export const FEATURES = {
    recruitModule: {
        key: "recruitModule",
        label: "Recruit",
        description: "Jobs, pipelines, candidates, interviews, and RMS operations."
    },
    careerPortal: {
        key: "careerPortal",
        label: "Career Portal",
        description: "Public job pages and applicant intake."
    },
    shareProfile: {
        key: "shareProfile",
        label: "Share Profile",
        description: "Secure candidate profile sharing with clients."
    },
    qrBridgeLogin: {
        key: "qrBridgeLogin",
        label: "QR Bridge Login",
        description: "QR-based bridge login for connected RMS sessions."
    },
    advancedAnalytics: {
        key: "advancedAnalytics",
        label: "Advanced Analytics",
        description: "Executive metrics, funnel analytics, and exportable insights."
    }
};

export const PLAN_CATALOG = {
    starter: {
        id: "starter",
        name: "Starter",
        priceMonthly: 1499,
        maxUsers: 1,
        features: Object.keys(FEATURES),
        customDomain: false
    },
    professional: {
        id: "professional",
        name: "Professional",
        priceMonthly: 2999,
        maxUsers: 3,
        features: Object.keys(FEATURES),
        customDomain: false
    },
    enterprise: {
        id: "enterprise",
        name: "Enterprise",
        priceMonthly: 8999,
        maxUsers: 8,
        features: Object.keys(FEATURES),
        customDomain: true
    },
    custom: {
        id: "custom",
        name: "Custom",
        priceMonthly: null,
        maxUsers: null,
        features: Object.keys(FEATURES),
        configurable: true,
        customDomain: true
    }
};

export const SUBSCRIPTION_STATUSES = {
    trialing: "trialing",
    active: "active",
    grace: "grace",
    pastDue: "past_due",
    cancelled: "cancelled",
    suspended: "suspended",
    expired: "expired"
};

export function getPlan(planId = "starter") {
    return PLAN_CATALOG[planId] || PLAN_CATALOG.starter;
}

export function resolvePlanLimits(subscription = {}, company = {}) {
    const plan = getPlan(subscription.plan || company.plan);
    const customLimits = subscription.customLimits || company.customLimits || {};
    const customFeatures = subscription.customFeatures || company.features;

    return {
        plan: plan.id,
        maxUsers: Number(customLimits.maxUsers || subscription.maxUsers || company.maxUsers || plan.maxUsers || 1),
        features: Array.isArray(customFeatures) && customFeatures.length ? customFeatures : plan.features,
        priceMonthly: customLimits.priceMonthly ?? subscription.priceMonthly ?? plan.priceMonthly
    };
}
