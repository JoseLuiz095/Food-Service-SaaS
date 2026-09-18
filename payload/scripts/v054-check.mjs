import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const pkg=JSON.parse(read('package.json'));
const admin=read('src/layouts/AdminLayout.tsx');
const master=read('src/layouts/MasterLayout.tsx');
const css=read('src/styles.css');
const index=read('index.html');
const diagnostics=read('src/pages/master/Diagnostics.tsx');
const eventRepair=read('supabase/migrations/202609171230_foodweb_v054_event_log_repair.sql');
const checks=[];
const ok=(label,condition)=>{checks.push({label,condition});console.log(`${condition?'OK  ':'FAIL'} ${label}`)};

ok('Versao 0.5.4',pkg.version==='0.5.4');
ok('Admin usa grupos Operacao/Catalogo/Gestao/Conta',admin.includes("label: 'Operação'")&&admin.includes("label: 'Catálogo'")&&admin.includes("label: 'Gestão'")&&admin.includes("label: 'Conta'"));
ok('Regras Food continuam condicionadas por feature',admin.includes('planHasFeature')&&admin.includes('requiresFeature'));
ok('Financeiro continua protegido pela feature finance',admin.includes("requiresFeature: 'finance'"));
ok('Analytics continua protegido pela feature analytics',admin.includes("requiresFeature: 'analytics'"));
ok('Admin Master continua acessivel ao platformAdmin',admin.includes('platformAdmin')&&admin.includes('/admin-master'));
ok('Identidade FoodWeb preservada',admin.includes('FoodWeb')&&admin.includes('UtensilsCrossed'));
ok('Paridade visual v0.5.4 aplicada',css.includes('FoodWeb v0.5.4 — paridade visual com FloriWeb'));
ok('Paleta alimentar interna aplicada',css.includes('--food-admin-accent:#c85d37')&&css.includes('--food-admin-sidebar:#3b251f'));
ok('Sidebar segue proporcao do FloriWeb',css.includes('grid-template-columns:260px minmax(0,1fr)'));
ok('Admin Master segue mesmo sistema visual',master.includes('master-admin-mini')&&css.includes('.master-shell .admin-content'));
ok('Status mensalidade preservado',admin.includes('admin-billing-status-v047')&&admin.includes('/admin/plano#vencimento'));
ok('Favicon v0.5.4 referenciado',index.includes('/favicon-foodweb-v054.svg')&&fs.existsSync('public/favicon-foodweb-v054.svg'));
ok('Integracao de interacoes possui reparo idempotente',eventRepair.includes('food_platform_event_log')&&eventRepair.includes('food_log_platform_event_v1')&&eventRepair.includes('food_platform_list_event_log_v1')&&eventRepair.includes("notify pgrst,'reload schema'"));
ok('Diagnostico trata RPC ausente sem erro tecnico bruto',diagnostics.includes('Integração de interações ainda não habilitada no banco')&&diagnostics.includes('SUPABASE_INTERACOES_V054.sql'));
ok('Texto de privacidade das interacoes alinhado ao FloriWeb',diagnostics.includes('Não são armazenados senha, token ou conteúdo de documentos'));
ok('Avatar do perfil usa fundo FoodWeb solido',css.includes('background:linear-gradient(135deg,var(--food-admin-accent),var(--food-admin-accent-dark))'));

const failed=checks.filter((item)=>!item.condition);
if(failed.length){
  console.error(`\n${failed.length} falha(s) na conferencia v0.5.4:`);
  for(const item of failed) console.error(`- ${item.label}`);
  process.exit(1);
}
console.log('\nFoodWeb v0.5.4 pronto: visual interno alinhado ao FloriWeb sem alterar regras de negocio.');
