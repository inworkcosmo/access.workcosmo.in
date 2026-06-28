export const COMPANY_MODULES = Object.freeze([
    {
        key: "hire",
        label: "Hire",
        description: "Recruitment, jobs, candidates, and hiring analytics.",
        icon: "fa-users-rays",
        featureKey: "recruitModule",
        tone: "blue"
    },
    {
        key: "core",
        label: "Core",
        description: "Employee records, documents, and HR operations.",
        icon: "fa-id-card-clip",
        featureKey: "coreModule",
        tone: "purple"
    },
    {
        key: "perform",
        label: "Perform",
        description: "Goals, performance cycles, and reviews.",
        icon: "fa-chart-line",
        featureKey: "performModule",
        tone: "emerald"
    },
    {
        key: "ai",
        label: "AI",
        description: "AI insights, parsing, and automation. Uses AI credits.",
        icon: "fa-brain",
        featureKey: "aiModule",
        tone: "orange",
        managesAiCredits: true
    }
]);

export function normalizeModulesEnabled(input = {}) {
    return COMPANY_MODULES.reduce((acc, mod) => {
        acc[mod.key] = input[mod.key] !== false;
        return acc;
    }, {});
}

export function modulesToFeatures(modulesEnabled = {}) {
    return COMPANY_MODULES.filter((mod) => modulesEnabled[mod.key]).map((mod) => mod.featureKey);
}

export function isAiModuleEnabled(company = {}) {
    const modulesEnabled = company.modulesEnabled || {};
    if (Object.prototype.hasOwnProperty.call(modulesEnabled, "ai")) {
        return modulesEnabled.ai === true;
    }
    const features = Array.isArray(company.features) ? company.features : [];
    return features.includes("aiModule");
}

export function companyAiCreditsRemaining(company = {}) {
    if (company.aiCreditsRemaining !== undefined && company.aiCreditsRemaining !== null) {
        return Number(company.aiCreditsRemaining || 0);
    }
    return Number(company.aiCredits || 0);
}
