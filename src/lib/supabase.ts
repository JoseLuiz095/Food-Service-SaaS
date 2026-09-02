import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appConfig, isSupabaseConfigured } from './config';

let client: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado.');
  if (!client) {
    client = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'foodservice.auth.v1',
      },
    });
  }
  return client;
};

export const supabaseClientOrNull = (): SupabaseClient | null => isSupabaseConfigured ? getSupabaseClient() : null;
