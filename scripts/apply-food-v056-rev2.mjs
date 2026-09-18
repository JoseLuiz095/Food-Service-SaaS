import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=process.cwd();
const here=path.dirname(fileURLToPath(import.meta.url));
const packageRoot=path.resolve(here,'..');
const payload=path.join(packageRoot,'payload');
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup=path.join(root,`_backup_v056_rev2_${stamp}`);
const fail=(m)=>{console.error(`ERRO: ${m}`);process.exit(1)};
const must=(rel)=>{const p=path.join(root,rel);if(!fs.existsSync(p))fail(`${rel} nao encontrado. Aplique primeiro o pacote FoodWeb V0.5.6 de auto cadastro.`);return p};
const backupFile=(rel)=>{const src=must(rel);const dst=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)};
const copyPayload=(rel)=>{const src=path.join(payload,rel);if(!fs.existsSync(src))fail(`Payload ausente: ${rel}`);const dst=path.join(root,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)};

['src/services/selfServiceSignup.ts','src/pages/store/SelfSignup.tsx','src/pages/master/SignupRequests.tsx'].forEach(backupFile);
fs.mkdirSync(backup,{recursive:true});
[
 'src/services/selfServiceSignup.ts',
 'src/pages/store/SelfSignup.tsx',
 'src/pages/master/SignupRequests.tsx',
 'supabase/migrations/202609180810_foodweb_v056_trial_eligibility_hardening.sql',
 'supabase/VALIDAR_V056_REV2.sql',
].forEach(copyPayload);
console.log('OK FoodWeb V0.5.6 REV2 aplicado.');
console.log(`Backup: ${path.basename(backup)}`);
console.log('PROXIMO: execute a migration 202609180810 e depois VALIDAR_V056_REV2.sql no Supabase.');
