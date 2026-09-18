import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const has=(p)=>fs.existsSync(path.join(root,p));
const check=(label,condition)=>{console.log(`${condition?'OK  ':'FAIL'} ${label}`);if(!condition)failures.push(label)};

const pkg=JSON.parse(read('package.json'));
const orders=read('src/pages/admin/Orders.tsx');
const storeApi=read('src/services/storeApi.ts');
const storeContext=read('src/contexts/StoreContext.tsx');
const types=read('src/types/index.ts');
const finance=read('src/pages/admin/Finance.tsx');
const migration='supabase/migrations/202609041610_foodweb_v049_order_payment_finance.sql';

check('FoodWeb v0.4.9 aplicado',pkg.version==='0.4.9');
check('Pedido possui paymentStatus',types.includes("OrderPaymentStatus = 'pending' | 'paid'"));
check('Orders possui Confirmar recebimento',orders.includes('Confirmar recebimento')&&orders.includes('confirmOrderPayment'));
check('Store API chama food_confirm_order_payment_v1',storeApi.includes('rpc/food_confirm_order_payment_v1'));
check('StoreContext recarrega pedido apos confirmar',storeContext.includes('storeApi.confirmOrderPayment(orderId)'));
check('Financeiro explica recebimento confirmado',finance.includes('Pedidos com recebimento confirmado entram automaticamente como receita'));
check('Migration v0.4.9 presente',has(migration));
check('Validacao v0.4.9 presente',has('supabase/VALIDAR_V049.sql'));
check('CSS v0.4.9 aplicado',read('src/styles.css').includes('FoodWeb v0.4.9 - confirmacao de recebimento do pedido'));

if(failures.length){console.error(`\n${failures.length} falha(s). v0.4.9 nao esta pronto para publicar.`);process.exit(1)}
console.log('\nv0.4.9 pronto. Execute a migration/validacao no Supabase antes de publicar.');
