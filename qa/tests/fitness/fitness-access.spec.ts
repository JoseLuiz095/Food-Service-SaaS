import { test, expect, type Page } from '@playwright/test';

// Browser UI contracts only. All Supabase traffic is intercepted; no accounts
// or payments are created in an external environment.
const store='10000000-0000-4000-8000-000000000001';
const user='30000000-0000-4000-8000-000000000001';
const plan='20000000-0000-4000-8000-000000000001';
const sessionId='50000000-0000-4000-8000-000000000001';
async function mock(page:Page, state='active') {
 let authorized=false;
 const calls:{path:string;body:any}[]=[];
 await page.addInitScript(({user,sessionId})=>{
  const payload={sub:user,session_id:sessionId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,aal:'aal1',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]};
  const token='header.'+btoa(JSON.stringify(payload))+'.signature';
  localStorage.setItem('foodservice.auth.v1',JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:payload.exp,expires_in:3600,token_type:'bearer',user:{id:user,email:'student@example.invalid',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},factors:[]}}));
 },{user,sessionId});
 await page.route('https://*.supabase.co/**',async route=>{
  const request=route.request(); const path=new URL(request.url()).pathname;
  const body=request.postData()?JSON.parse(request.postData()!):null;
  calls.push({path,body});
  let result:unknown=[];
  if(path.endsWith('/food_fitness_access_v1')) {
   if(body?.p_action==='claim')authorized=true;
   result={store_id:store,user_id:user,state,access:state==='active',session_allowed:authorized,session_limit:1,paid_until:state==='active'?'2027-01-01T00:00:00Z':null,reason:authorized?null:'SESSION_UNCLAIMED'};
  } else if(path.endsWith('/food_fitness_offers_v1')) result={environment:'sandbox',plans:[{id:plan,name:'Acompanhamento mensal',amount_cents:12000,cycle:'MONTHLY'}]};
  else if(path.endsWith('/food-fitness-checkout')) result={environment:'sandbox',checkoutStatus:'awaiting_payment',enrollment_id:'40000000-0000-4000-8000-000000000001',invoiceUrl:'https://sandbox.asaas.com/i/test_only'};
  else if(path==='/auth/v1/user') result={id:user,email:'student@example.invalid',app_metadata:{provider:'email'},user_metadata:{},factors:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 return calls;
}
for(const width of [375,1280]) test(`paid student authorizes its own session without overflow at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const failures:string[]=[]; page.on('pageerror',error=>failures.push(error.message));
 const calls=await mock(page);
 await page.goto(`/fitness/${store}`);
 await expect(page.getByRole('heading',{name:'Pagamento confirmado'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Autorizar esta sessão'})).toBeVisible();
 await page.getByRole('button',{name:'Autorizar esta sessão'}).click();
 await expect(page.getByText('Seu acesso Fitness está autorizado nesta sessão.')).toBeVisible();
 const claim=calls.find(call=>call.body?.p_action==='claim');
 expect(claim?.body).toEqual({p_store_id:store,p_action:'claim',p_reason:null});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 expect(failures).toEqual([]);
});
test('browser success query cannot grant pending access; checkout is explicitly sandbox',async({page})=>{
 const calls=await mock(page,'pending');
 await page.goto(`/fitness/${store}?success=1&paid=true`);
 await expect(page.getByRole('heading',{name:'Aguardando confirmação'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Autorizar esta sessão'})).toHaveCount(0);
 await page.getByLabel('Nome para cobrança de teste').fill('Sandbox Example');
 await page.getByLabel('CPF/CNPJ de teste').fill('12345678901');
 const purchase=page.getByRole('button',{name:'Consultar ou gerar cobrança de teste'});
 await expect(purchase).toBeDisabled();
 await page.getByRole('checkbox').check();
 await purchase.click();
 await expect(page.getByRole('link',{name:'Abrir cobrança no sandbox Asaas'})).toHaveAttribute('href','https://sandbox.asaas.com/i/test_only');
 await expect(page.getByRole('heading',{name:'Aguardando confirmação'})).toBeVisible();
 expect(calls.find(call=>call.path.endsWith('/food-fitness-checkout'))?.body).toEqual({storeId:store,planId:plan,name:'Sandbox Example',cpfCnpj:'12345678901',sandboxConsent:true});
});
test('invalid store link cannot reach account or payment actions',async({page})=>{
 await page.route('https://*.supabase.co/**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
 await page.goto('/fitness/invalid-store');
 await expect(page.getByText('O link da loja é inválido. Solicite ao responsável o endereço correto.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Entrar',exact:true})).toHaveCount(0);
});
