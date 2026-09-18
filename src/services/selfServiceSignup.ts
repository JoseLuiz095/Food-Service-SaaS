import { appConfig } from '../lib/config';
import { getSupabaseClient } from '../lib/supabase';
import { restFetch } from '../lib/supabaseRest';

export type SelfServiceSignupInput = {
  storeName: string;
  ownerName: string;
  email: string;
  password: string;
  planCode: string;
  city?: string;
  state?: string;
  contactPhone: string;
  businessDocument?: string;
  captchaToken: string;
};

export type SelfServiceCompletion = {
  ok: boolean;
  existing?: boolean;
  requestId?: string;
  storeId: string;
  slug?: string;
  requestStatus: 'pending' | 'approved' | 'rejected' | string;
  trialGranted?: boolean;
  trialExpiresAt?: string | null;
  workspaceLimited?: boolean;
};

export type SelfServiceSignupRequest = {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  email: string;
  ownerName: string;
  contactPhone: string;
  businessDocument?: string | null;
  requestedPlanId: string;
  requestedPlanCode: string;
  requestedPlanName: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  trialGranted: boolean;
  trialExpiresAt?: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  accessStatus: 'online' | 'suspended';
  createdAt: string;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
};

type SignupRow = {
  id: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  email: string;
  owner_name: string;
  contact_phone: string;
  business_document?: string | null;
  requested_plan_id: string;
  requested_plan_code: string;
  requested_plan_name: string;
  status: SelfServiceSignupRequest['status'];
  trial_granted: boolean;
  trial_expires_at?: string | null;
  approval_status: SelfServiceSignupRequest['approvalStatus'];
  access_status: SelfServiceSignupRequest['accessStatus'];
  created_at: string;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
};

const rpc = <T>(name: string, body: Record<string, unknown> = {}) =>
  restFetch<T>(`rpc/${name}`, { method: 'POST', body });

const completionBody = (input?: Partial<SelfServiceSignupInput>) => ({
  p_store_name: input?.storeName || null,
  p_owner_name: input?.ownerName || null,
  p_plan_code: input?.planCode || null,
  p_city: input?.city || null,
  p_state: input?.state || null,
  p_contact_phone: input?.contactPhone || null,
  p_business_document: input?.businessDocument || null,
});

export async function completeFoodSelfServiceSignup(input?: Partial<SelfServiceSignupInput>) {
  return rpc<SelfServiceCompletion>('food_complete_self_service_signup_v2', completionBody(input));
}

export async function createFoodSelfServiceAccount(input: SelfServiceSignupInput) {
  if (!appConfig.turnstileSiteKey) throw new Error('Cadastro temporariamente indisponível: Turnstile não configurado neste build.');
  if (!input.captchaToken) throw new Error('Conclua a verificação de segurança.');

  const supabase = getSupabaseClient();
  const metadata = {
    foodweb_signup: {
      store_name: input.storeName.trim(),
      owner_name: input.ownerName.trim(),
      plan_code: input.planCode.trim().toUpperCase(),
      city: (input.city || '').trim(),
      state: (input.state || '').trim().toUpperCase(),
      contact_phone: input.contactPhone.replace(/\D/g, ''),
      business_document: (input.businessDocument || '').replace(/\D/g, ''),
    },
  };

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      captchaToken: input.captchaToken,
      emailRedirectTo: `${window.location.origin}/cadastro/confirmar`,
      data: metadata,
    },
  });
  if (error) throw error;

  if (data.session) {
    const completion = await completeFoodSelfServiceSignup(input);
    return { requiresEmailConfirmation: false, completion };
  }

  return { requiresEmailConfirmation: true, completion: null as SelfServiceCompletion | null };
}

export async function continueFoodSelfServiceWithExistingAccount(input: SelfServiceSignupInput) {
  if (!appConfig.turnstileSiteKey) throw new Error('Cadastro temporariamente indisponível: Turnstile não configurado neste build.');
  if (!input.captchaToken) throw new Error('Conclua a verificação de segurança.');

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: { captchaToken: input.captchaToken },
  });
  if (error) throw error;
  return completeFoodSelfServiceSignup(input);
}

export async function listFoodSelfServiceSignupRequests(): Promise<SelfServiceSignupRequest[]> {
  const rows = await rpc<SignupRow[]>('food_platform_list_self_service_signups_v2');
  return (rows || []).map((row) => ({
    id: row.id,
    storeId: row.store_id,
    storeName: row.store_name,
    storeSlug: row.store_slug,
    email: row.email,
    ownerName: row.owner_name,
    contactPhone: row.contact_phone,
    businessDocument: row.business_document,
    requestedPlanId: row.requested_plan_id,
    requestedPlanCode: row.requested_plan_code,
    requestedPlanName: row.requested_plan_name,
    status: row.status,
    trialGranted: Boolean(row.trial_granted),
    trialExpiresAt: row.trial_expires_at,
    approvalStatus: row.approval_status,
    accessStatus: row.access_status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
  }));
}

export const approveFoodSelfServiceSignup = (requestId: string) =>
  rpc<{ ok: boolean; storeId?: string }>('food_platform_approve_self_service_signup_v2', { p_request_id: requestId });

export const rejectFoodSelfServiceSignup = (requestId: string, reason: string) =>
  rpc<{ ok: boolean; storeId?: string }>('food_platform_reject_self_service_signup_v1', { p_request_id: requestId, p_reason: reason || null });
