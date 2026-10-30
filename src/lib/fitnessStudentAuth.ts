import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appConfig, isSupabaseConfigured } from './config';

let studentAuthClient: SupabaseClient | null = null;

export const getFitnessStudentAuthClient = (): SupabaseClient => {
  if (!isSupabaseConfigured) throw new Error('Supabase não configurado.');
  if (!studentAuthClient) {
    studentAuthClient = createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'foodservice.fitness.student.auth.v1',
      },
    });
  }
  return studentAuthClient;
};
