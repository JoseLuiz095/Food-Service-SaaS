import { appConfig, isSupabaseConfigured } from './config';
import { getSupabaseClient } from './supabase';

type QueryOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  prefer?: string;
  headers?: Record<string, string>;
  keepalive?: boolean;
};

export class SupabaseHttpError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'SupabaseHttpError';
    this.status = status;
    this.details = details;
  }
}

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
};

const throwIfError = async (response: Response) => {
  if (response.ok) return;
  const payload = await parseResponse(response) as { message?: string; error?: string; error_description?: string; details?: string; code?: string } | string | null;
  const message = typeof payload === 'string'
    ? payload
    : payload?.message || payload?.error || payload?.error_description || `Erro HTTP ${response.status}`;
  const details = typeof payload === 'object' && payload ? (payload.details || payload.code) : undefined;
  throw new SupabaseHttpError(message, response.status, details);
};

const currentAccessToken = async (): Promise<string> => {
  if (!isSupabaseConfigured) return '';
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? '';
};

export const restFetch = async <T>(path: string, options: QueryOptions = {}): Promise<T> => {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado.');
  const token = options.token || await currentAccessToken();
  const response = await fetch(`${appConfig.supabaseUrl}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: appConfig.supabaseAnonKey,
      Authorization: `Bearer ${token || appConfig.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    keepalive: options.keepalive ?? false,
  });
  await throwIfError(response);
  return await parseResponse(response) as T;
};

export const storageUpload = async (bucket: string, path: string, file: File): Promise<{ url: string; path: string }> => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
};

export const storageDelete = async (bucket: string, paths: string[]) => {
  if (!paths.length) return;
  const { error } = await getSupabaseClient().storage.from(bucket).remove(paths);
  if (error) throw error;
};

export const requestPasswordRecovery = async (email: string, redirectTo: string): Promise<void> => {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
};

export const recoveryTokenFromLocation = (): string => {
  if (typeof window === 'undefined') return '';
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return hash.get('access_token') || query.get('code') || query.get('token_hash') || 'supabase-managed-recovery';
};

export const updatePasswordWithRecoveryToken = async (_recoveryMarker: string, password: string): Promise<void> => {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error('Link de recuperação inválido ou expirado. Solicite um novo link.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
};

export const updateAuthenticatedPassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const email = userData.user?.email;
  if (!email) throw new Error('E-mail da sessão não disponível.');

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) throw new Error('Senha atual incorreta.');
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;
};

export const invokePublicFunction = async <T>(name: string, body: unknown): Promise<T> => {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado.');
  const response = await fetch(`${appConfig.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: appConfig.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 404) {
    throw new SupabaseHttpError(`A Edge Function "${name}" não está publicada neste projeto Supabase.`, 404, 'EDGE_FUNCTION_NOT_DEPLOYED');
  }
  await throwIfError(response);
  return await parseResponse(response) as T;
};

export const invokeFunction = async <T>(name: string, body: unknown): Promise<T> => {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado.');
  const token = await currentAccessToken();
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  const response = await fetch(`${appConfig.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: appConfig.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 404) {
    throw new SupabaseHttpError(`A Edge Function "${name}" não está publicada neste projeto Supabase.`, 404, 'EDGE_FUNCTION_NOT_DEPLOYED');
  }
  await throwIfError(response);
  return await parseResponse(response) as T;
};

export type EdgeFunctionHealth = {
  ok: boolean;
  function: string;
  version: string;
  configured: boolean;
  turnstileConfigured?: boolean;
  turnstileRequired?: boolean;
};

export const edgeFunctionHealth = async (name: string): Promise<EdgeFunctionHealth> => {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado.');
  const token = await currentAccessToken();
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  const response = await fetch(`${appConfig.supabaseUrl}/functions/v1/${name}`, {
    method: 'GET',
    headers: { apikey: appConfig.supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) throw new SupabaseHttpError(`A Edge Function "${name}" não está publicada neste projeto Supabase.`, 404, 'EDGE_FUNCTION_NOT_DEPLOYED');
  await throwIfError(response);
  return await parseResponse(response) as EdgeFunctionHealth;
};
