import type { Plan } from '../types';

export const planHasFeature = (plan: Plan | null | undefined, code: string) => {
  if (!plan) return false;
  if (plan.featureCodes?.includes(code)) return true;
  // Compatibilidade com bancos ainda sem a migration v0.3 aplicada.
  if (code === 'analytics') return Boolean(plan.reports);
  if (code === 'custom_domain') return Boolean(plan.customDomain);
  return false;
};

export const planFeatureLimit = (plan: Plan | null | undefined, code: string): number | null => {
  const value = plan?.featureLimits?.[code];
  return value == null ? null : Number(value);
};

export const paidPlanRank = (code: string) => ({ ESSENTIAL: 1, STARTER: 2, PROFESSIONAL: 3 }[code] ?? 0);
