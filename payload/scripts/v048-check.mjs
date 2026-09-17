import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const exists=(p)=>fs.existsSync(path.join(root,p));
let failed=false;
const check=(label,condition)=>{console.log(`${condition?'OK  ':'ERRO'} ${label}`);if(!condition)failed=true;};

const pkg=JSON.parse(read('package.json'));
const stores=read('src/pages/master/Stores.tsx');
const styles=read('src/styles.css');
const api=read('src/services/platformApi.ts');
const edge=read('supabase/functions/food-platform-manage-store-user/index.ts');
const index=read('index.html');

const accessPos=stores.indexOf('master-credential-edit-v048');
const planPos=stores.indexOf('PLANO E COBRANCA')>=0?stores.indexOf('PLANO E COBRANCA'):stores.indexOf('PLANO E COBRANÇA');
check('FoodWeb v0.4.8 aplicado na raiz correta',pkg.name==='foodservice-saas'&&pkg.version==='0.4.8');
check('Acesso do lojista aparece antes de plano e cobranca',accessPos>=0&&planPos>=0&&accessPos<planPos);
check('Tela possui e-mail, nova senha e confirmacao',stores.includes('E-mail de acesso')&&stores.includes('Nova senha')&&stores.includes('Confirmar nova senha')&&stores.includes('Salvar e-mail / senha'));
check('Frontend possui API de atualizacao de credenciais',api.includes('updateStoreCredentials')&&api.includes('food-platform-manage-store-user'));
check('Edge Function de credenciais esta presente',edge.includes('auth.admin.updateUserById')&&edge.includes('MFA_AAL2_REQUIRED'));
check('Estilos v0.4.8 foram aplicados',styles.includes('FoodWeb v0.4.8: acesso do lojista visivel')&&styles.includes('.master-credential-edit-v048'));
check('Favicon v0.4.8 referenciado',index.includes('favicon-foodweb-v048.svg')&&exists('public/favicon-foodweb-v048.svg'));
check('Base v0.4.6 de mensalidade preservada',exists('supabase/migrations/202609032230_foodweb_v046_billing_access.sql'));

if(failed)process.exit(1);
