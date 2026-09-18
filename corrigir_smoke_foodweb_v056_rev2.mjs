import fs from 'node:fs';

const file = 'scripts/smoke.mjs';
if (!fs.existsSync(file)) {
  console.error('ERRO: scripts/smoke.mjs nao encontrado.');
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');

const old = `ok('v0.5.6 Master aprova auto cadastro', signupRequests.includes('Liberar') && selfSignupService.includes('food_platform_approve_self_service_signup_v1'));`;
const next = `ok('v0.5.6 Master aprova auto cadastro', signupRequests.includes('Liberar') && selfSignupService.includes('food_platform_approve_self_service_signup_v2'));`;

if (s.includes(old)) {
  s = s.replace(old, next);
} else if (!s.includes(next)) {
  console.error('ERRO: nao encontrei o check esperado de aprovacao do auto cadastro.');
  process.exit(2);
}

// Atualiza apenas o texto/check antigo de elegibilidade para refletir a REV2.
// Mantem compatibilidade caso a linha ainda esteja na versao inicial.
s = s.replace(
  `ok('v0.5.6 Demo uma vez por email', m056.includes('food_trial_claims') && m056.includes('ja utilizou o periodo Demo'));`,
  `ok('v0.5.6 Demo com elegibilidade cadastral', exists('supabase/migrations/202609180810_foodweb_v056_trial_eligibility_hardening.sql') && selfSignup.includes('validação cadastral do negócio') && selfSignupService.includes('complete_self_service_signup_v2'));`
);

fs.writeFileSync(file, s, 'utf8');

if (!s.includes("food_platform_approve_self_service_signup_v2")) {
  console.error('ERRO: smoke nao ficou apontando para a RPC v2.');
  process.exit(3);
}

console.log('OK: smoke.mjs atualizado para FoodWeb v0.5.6 REV2.');
