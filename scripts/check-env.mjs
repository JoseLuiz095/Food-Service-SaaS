import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_URL = 'https://elttryavkeartoxgdgse.supabase.co';
const DEFAULT_KEY = 'sb_publishable_zBBXeb_s0IPTQgN283z9tw_-MisrJpl';
const root = process.cwd();
const files = ['.env', '.env.local', '.env.production', '.env.production.local'];
const values = { ...process.env };

for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  for (const rawLine of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in values) || !values[key]) values[key] = value;
  }
}

const configuredUrl = String(values.VITE_SUPABASE_URL || '').trim();
const configuredKey = String(values.VITE_SUPABASE_ANON_KEY || values.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const url = configuredUrl || DEFAULT_URL;
const key = configuredKey || DEFAULT_KEY;
const problems = [];
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
