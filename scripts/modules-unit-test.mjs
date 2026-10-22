import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const source=readFileSync('src/modules/calculator.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {calculatePrintPrice,defaultPrintCosts}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const result=calculatePrintPrice(defaultPrintCosts);
assert.equal(result.baseCents,1280); // 240 filamento + 40 energia + 400 máquina + 500 trabalho + 100 acabamento.
assert.equal(result.suggestedCents,1829);
assert.equal(calculatePrintPrice(defaultPrintCosts,2000).suggestedCents,2194);
for(const bad of [-1,NaN,Infinity]) assert.throws(()=>calculatePrintPrice({...defaultPrintCosts,grams:bad}));
assert.throws(()=>calculatePrintPrice({...defaultPrintCosts,margin_bps:10000}));
assert.throws(()=>calculatePrintPrice(defaultPrintCosts,10001));
assert.equal(calculatePrintPrice({...defaultPrintCosts,grams:0,hours:0,labor_cents:0,finishing_cents:0}).suggestedCents,0);
console.log('OK calculadora: custos, margem, urgência, limites e zero');

// Contrato de preservação: compara arquivos legados à base main integrada, sem executar Git mutante.
const baseline='9d5c79f';
// Presentation changes audited in the segment release. A small, explicit VendeWeb list
// is allowed below: it only changes public identity, PWA assets and additive CORS origins.
// Payment, stock, order services, contexts and every existing SQL migration remain exact.
const presentationFiles=new Set([
  'src/pages/store/Landing.tsx','src/pages/store/SelfSignup.tsx','src/pages/store/Home.tsx',
  'src/services/platformApi.ts','src/services/selfServiceSignup.ts','src/utils/storeVisualTheme.ts',
  'src/types/index.ts','src/components/admin/AdminStoreShare.tsx',
]);
const vendewebIdentityFiles=new Set([
  'src/pages/store/Checkout.tsx','src/pages/store/SignupComplete.tsx','src/styles.css',
  'src/components/admin/AdminNotifications.tsx',
  'supabase/functions/food-public-checkout/index.ts',
  'supabase/functions/food-public-contact/index.ts',
  'supabase/functions/food-public-self-signup/index.ts',
]);
const protectedFiles=execFileSync('git',['ls-tree','-r','--name-only',baseline,'src/contexts','src/pages/store','src/services','src/utils','src/styles.css','src/types','src/components/admin','supabase/functions','supabase/migrations'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(file=>file&&!presentationFiles.has(file)&&!vendewebIdentityFiles.has(file));
const changed=execFileSync('git',['diff','--name-only',baseline,'--',...protectedFiles],{encoding:'utf8'}).trim();
assert.equal(changed,'',`Fluxo legado alterado:\n${changed}`);
console.log(`OK preservação: ${protectedFiles.length} arquivos operacionais iguais ao main ${baseline}`);

const vendewebCheckout=readFileSync('supabase/functions/food-public-checkout/index.ts','utf8');
const vendewebContact=readFileSync('supabase/functions/food-public-contact/index.ts','utf8');
const vendewebSignup=readFileSync('supabase/functions/food-public-self-signup/index.ts','utf8');
assert.ok(vendewebCheckout.includes('originIsAllowed')&&vendewebCheckout.includes('ORIGIN_NOT_ALLOWED')&&vendewebCheckout.includes('public_request_id: requestId'));
assert.ok(vendewebCheckout.includes("'https://vendeweb.com.br'")&&vendewebCheckout.includes("'https://www.vendeweb.com.br'"));
assert.ok(vendewebContact.includes('validateTurnstile')&&vendewebContact.includes('DEFAULT_PUBLIC_ORIGINS')&&vendewebContact.includes("'https://vendeweb.com.br'"));
assert.ok(vendewebSignup.includes('verifyTurnstile')&&vendewebSignup.includes("'https://www.vendeweb.com.br'"));
console.log('OK identidade VendeWeb: checkout preservado e origens públicas aditivas');
