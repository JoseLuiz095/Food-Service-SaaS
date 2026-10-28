import { platformOrigin } from '../lib/brand';
import { getSupabaseClient } from '../lib/supabase';
import { temporaryPasswordValidationMessage } from '../utils/email';

export type FitnessAccess = {
  store_id: string;
  user_id: string;
  state: 'pending' | 'active' | 'grace' | 'suspended' | 'cancelled';
  access: boolean;
  session_allowed: boolean;
  session_limit: 0 | 1;
  paid_until: string | null;
  session_id?: string;
  reason?: string;
};

export const isFitnessStoreId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export type FitnessPlan = { id: string; name: string; amount_cents: number; cycle: 'MONTHLY' };
export async function fitnessOffers(storeId: string): Promise<FitnessPlan[]> {
  requireStore(storeId);
  const { data, error } = await getSupabaseClient().rpc('food_fitness_offers_v1', { p_store_id: storeId });
  if (error || data?.environment !== 'sandbox' || !Array.isArray(data.plans)) return [];
  return data.plans.filter((plan: FitnessPlan) => isFitnessStoreId(plan.id) && Number.isSafeInteger(plan.amount_cents) && plan.amount_cents > 0 && plan.cycle === 'MONTHLY');
}

export async function fitnessCheckout(storeId: string, planId: string, name: string, cpfCnpj: string) {
  requireStore(storeId);
  const { data, error } = await getSupabaseClient().functions.invoke('food-fitness-checkout', {
    body: { storeId, planId, name, cpfCnpj, sandboxConsent: true },
  });
  if (error) throw new Error('Não foi possível concluir a cobrança de teste. Uma tentativa inconclusiva requer conferência; repetir a solicitação não cria outra assinatura.');
  if (data?.environment !== 'sandbox' || !['awaiting_payment', 'payment_processing'].includes(data.checkoutStatus)) throw new Error('A cobrança não retornou uma confirmação válida do ambiente de teste.');
  if (data.invoiceUrl) {
    const url = new URL(data.invoiceUrl);
    if (url.origin !== 'https://sandbox.asaas.com' || !/^\/i\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) throw new Error('O endereço da cobrança de teste não é válido.');
  }
  return { invoiceUrl: data.invoiceUrl as string | null };
}

const requireStore = (storeId: string) => {
  if (!isFitnessStoreId(storeId)) throw new Error('O link da loja é inválido. Solicite o endereço correto ao responsável.');
};

/** The redirect is constructed locally; query strings cannot choose an external destination. */
export const fitnessCallbackUrl = (storeId: string, recovery = false) => {
  requireStore(storeId);
  const target = new URL(`/fitness/${storeId}`, platformOrigin());
  if (recovery) target.searchParams.set('recovery', '1');
  return target.toString();
};

export async function fitnessAccess(storeId: string, action: 'status' | 'claim' | 'release' = 'status'): Promise<FitnessAccess> {
  requireStore(storeId);
  const { data, error } = await getSupabaseClient().rpc('food_fitness_access_v1', {
    p_store_id: storeId, p_action: action, p_reason: null,
  });
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) throw new Error('O acesso Fitness ainda não foi configurado neste ambiente. Nenhuma permissão foi liberada.');
    throw new Error(error.message || 'Não foi possível verificar seu acesso. Tente novamente.');
  }
  if (!data || data.store_id !== storeId || typeof data.access !== 'boolean' || typeof data.session_allowed !== 'boolean') {
    throw new Error('A verificação de acesso não retornou uma resposta válida.');
  }
  return data as FitnessAccess;
}

export async function fitnessSignIn(email: string, password: string, captchaToken: string) {
  const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password, options: { captchaToken } });
  if (error) throw new Error('Não foi possível entrar. Confira suas credenciais, a confirmação do e-mail e a verificação de segurança.');
}

export async function fitnessSignUp(storeId: string, email: string, password: string, captchaToken: string) {
  const validation = temporaryPasswordValidationMessage(password);
  if (validation) throw new Error(validation);
  const { error } = await getSupabaseClient().auth.signUp({
    email: email.trim(), password,
    options: { emailRedirectTo: fitnessCallbackUrl(storeId), captchaToken },
  });
  if (error) throw new Error('Não foi possível solicitar o cadastro. Aguarde e tente novamente ou use a recuperação de uma conta existente.');
}

export async function fitnessRecoverPassword(storeId: string, email: string, captchaToken: string) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: fitnessCallbackUrl(storeId, true), captchaToken,
  });
  if (error) throw new Error('Não foi possível enviar a recuperação. Aguarde e tente novamente; o envio por e-mail precisa estar configurado neste ambiente.');
}

export async function fitnessPasswordMfa(): Promise<string | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error('Não foi possível verificar a proteção da conta.');
  if (data.nextLevel !== 'aal2' || data.currentLevel === 'aal2') return null;
  const { data: factors, error: factorError } = await client.auth.mfa.listFactors();
  if (factorError) throw new Error('Não foi possível consultar o autenticador da conta.');
  const factor = factors.totp.find((item) => item.status === 'verified');
  if (!factor) throw new Error('Esta conta exige segundo fator. Use o fluxo de recuperação aprovado pelo administrador.');
  return factor.id;
}

export async function fitnessVerifyMfa(factorId: string, code: string) {
  const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new Error('Código do autenticador inválido ou expirado.');
}

export async function fitnessSetPassword(password: string) {
  const validation = temporaryPasswordValidationMessage(password);
  if (validation) throw new Error(validation);
  if (await fitnessPasswordMfa()) throw new Error('Confirme o segundo fator antes de alterar a senha.');
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw new Error('Não foi possível atualizar a senha. Solicite outro link se a sessão tiver expirado.');
}

export async function fitnessSignOut(storeId: string) {
  try { await fitnessAccess(storeId, 'release'); } catch { /* Auth logout still invalidates this session; no global sign-out. */ }
  const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' });
  if (error) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
}
