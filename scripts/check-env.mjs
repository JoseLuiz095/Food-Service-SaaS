import { loadEnv } from 'vite';
import { validatePublicEnvironment } from './public-env-validation.mjs';

const DEFAULT_URL = 'https://elttryavkeartoxgdgse.supabase.co';
const DEFAULT_KEY = 'sb_publishable_zBBXeb_s0IPTQgN283z9tw_-MisrJpl';
// Mesma precedência e expansão usadas pelo build, sem imprimir valores.
const values = loadEnv('production', process.cwd(), 'VITE_');

const configuredUrl = String(values.VITE_SUPABASE_URL || '').trim();
const configuredKey = String(values.VITE_SUPABASE_ANON_KEY || values.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const url = configuredUrl || DEFAULT_URL;
const key = configuredKey || DEFAULT_KEY;
const problems = validatePublicEnvironment(values);
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) problems.push('VITE_SUPABASE_URL nao parece ser uma URL valida do Supabase.');
if (key.length < 20) problems.push('A chave publica do Supabase parece incompleta.');
if (problems.length) {
  console.error('\nERRO: configuracao publica do Supabase invalida.\n');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`OK   Supabase URL ${configuredUrl ? 'vinda do ambiente' : 'usando padrao publico FoodWeb'}`);
console.log(`OK   Chave publica ${configuredKey ? 'vinda do ambiente' : 'usando padrao publico FoodWeb'}`);
if (!String(values.VITE_TURNSTILE_SITE_KEY || '').trim()) console.warn('WARN VITE_TURNSTILE_SITE_KEY vazia. Login funciona, mas checkout pode ficar indisponivel quando TURNSTILE_REQUIRED=true.');
else console.log('OK   Turnstile Site Key configurada');
