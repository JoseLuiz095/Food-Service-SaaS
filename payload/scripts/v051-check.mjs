import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const exists=(file)=>fs.existsSync(path.join(root,file));
const checks=[];
const ok=(label,value)=>checks.push([label,Boolean(value)]);

const pkg=JSON.parse(read('package.json'));
const adminPlan=read('src/pages/admin/Plan.tsx');
const masterPlans=read('src/pages/master/Plans.tsx');
const stores=read('src/pages/master/Stores.tsx');
const landing=read('src/pages/store/Landing.tsx');
const platformApi=read('src/services/platformApi.ts');
const index=read('index.html');
const migration=read('supabase/migrations/202609151340_foodweb_v051_plan_alignment.sql');

ok('FoodWeb v0.5.1 aplicado',pkg.version==='0.5.1');
ok('Escada Essencial Profissional Premium',platformApi.includes("name:'Essencial'")&&platformApi.includes("name:'Profissional'")&&platformApi.includes("name:'Premium'"));
ok('Precos alinhados 49.90 89.90 149.90',platformApi.includes('monthlyPrice:49.9')&&platformApi.includes('monthlyPrice:89.9')&&platformApi.includes('monthlyPrice:149.9'));
ok('Usuarios administrativos adicionais fora da oferta',!masterPlans.includes('value={plan.adminUserLimit')&&!platformApi.includes("'multi_user'"));
ok('Business sem preco fixo',adminPlan.includes('Sob consulta')&&!adminPlan.includes('R$ 349,90'));
ok('Business inclui dominio proprio',adminPlan.includes('Domínio próprio incluído')&&landing.includes('Domínio próprio incluído'));
ok('Business aparece na landing',landing.includes('food-business-sales-v051'));
ok('Master explica Business sob medida',masterPlans.includes('master-business-v051'));
ok('Tabela de lojas mostra acesso principal',stores.includes('acesso principal configurado'));
ok('Migration v0.5.1 presente',exists('supabase/migrations/202609151340_foodweb_v051_plan_alignment.sql'));
ok('Migration desabilita multi_user',migration.includes("feature_code='multi_user'")&&migration.includes('enabled=false'));
ok('Premium habilita dominio proprio',migration.includes("name='Premium'")&&migration.includes('custom_domain=true'));
ok('Validacao v0.5.1 presente',exists('supabase/VALIDAR_V051.sql'));
ok('Favicon v0.5.1 referenciado',index.includes('favicon-foodweb-v051.svg')&&exists('public/favicon-foodweb-v051.svg'));

let failed=0;
for(const [label,pass] of checks){console.log(`${pass?'OK  ':'ERRO'} ${label}`);if(!pass)failed++;}
if(failed){console.error(`\n${failed} verificacao(oes) falharam.`);process.exit(1);}
console.log('\nFoodWeb v0.5.1 pronto para migration, validacao e publicacao.');
