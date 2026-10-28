import { test, expect } from '@playwright/test';
import { mockBackend, STORE, store } from './fixtures';

test('Master libera solicitação após confirmação e mantém resultado após reload',async({page})=>{
 await mockBackend(page,{auth:true,master:true});
 const requestId='a0000000-0000-4000-8000-000000000001';
 let approved=false;let calls=0;
 await page.route('**/rest/v1/rpc/food_platform_list_self_service_signups_v2',r=>r.fulfill({json:[{id:requestId,store_id:STORE,store_name:store.name,store_slug:store.slug,email:'teste@example.invalid',owner_name:'Pessoa teste',contact_phone:'11999999999',requested_plan_name:'Essencial',requested_plan_code:'ESSENTIAL',status:approved?'approved':'pending',access_status:approved?'online':'preparation',created_at:new Date().toISOString()}]}));
 await page.route('**/rest/v1/rpc/food_platform_approve_self_service_signup_v2',r=>{
  expect(r.request().postDataJSON()).toEqual({p_request_id:requestId});calls++;approved=true;return r.fulfill({json:{ok:true,storeId:STORE}});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto('/admin-master/solicitacoes');
 page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Liberar',exact:true}).click();
 await expect(page.getByText('Cadastro liberado.',{exact:true})).toBeVisible();
 expect(calls).toBe(1);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Nenhuma solicitação pendente'})).toBeVisible();
});

test('Master troca plano direto na listagem com persistência simulada',async({page})=>{
 await mockBackend(page,{auth:true,master:true});
 const plans=[{id:'61000000-0000-4000-8000-000000000001',name:'Essencial',code:'ESSENTIAL',active:true,monthly_price:30},{id:'61000000-0000-4000-8000-000000000002',name:'Profissional',code:'PROFESSIONAL',active:true,monthly_price:60}];
 let subscription={id:'62000000-0000-4000-8000-000000000001',store_id:STORE,plan_id:plans[0].id,status:'active',billing_amount:30,billing_mode:'standard',due_day:10};
 await page.route('**/rest/v1/food_plans?**',r=>{const id=new URL(r.request().url()).searchParams.get('id');return r.fulfill({json:id?plans.filter(p=>`eq.${p.id}`===id):plans});});
 await page.route('**/rest/v1/food_store_subscriptions?**',r=>{
  if(r.request().method()==='PATCH')subscription={...subscription,...r.request().postDataJSON()};
  return r.fulfill({json:[subscription]});
 });
 await page.goto('/admin-master/lojas');
 await page.getByRole('combobox',{name:`Plano de ${store.name}`,exact:true}).selectOption(plans[1].id);
 await expect(page.getByText('Plano atualizado.',{exact:true})).toBeVisible();
 expect(subscription.plan_id).toBe(plans[1].id);
 expect(subscription.billing_amount).toBe(60);
 await page.reload();
 await expect(page.getByRole('combobox',{name:`Plano de ${store.name}`,exact:true})).toHaveValue(plans[1].id);
});
