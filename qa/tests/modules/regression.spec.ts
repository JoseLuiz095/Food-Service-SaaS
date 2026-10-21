import { test, expect } from '@playwright/test';
import { mockBackend, STORE, ORDER } from './fixtures';

for(const width of [390,768,1366]) {
  test(`módulos desativados e ativação por configuração em ${width}px`,async({page})=>{
    const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:844});
    await mockBackend(page,{auth:true});
    await page.goto('/admin/modulos');
    await expect(page.getByRole('heading',{name:'Módulos opcionais',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Combos',exact:true})).toHaveCount(0);
    await expect(page.getByRole('link',{name:'Abrir catálogo de eventos desta loja'})).toHaveCount(0);
    await expect(page.getByRole('checkbox',{name:'Eventos',exact:true})).not.toBeChecked();
    await page.getByRole('checkbox',{name:'Eventos',exact:true}).check();
    await page.getByRole('checkbox',{name:'Combos com parceiros'}).check();
    await page.getByRole('button',{name:'Salvar configuração desta loja'}).click();
    await expect(page.getByRole('button',{name:'Combos',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('calculadora 3D aceita preço final escolhido pelo lojista',async({page})=>{
  await mockBackend(page,{auth:true,enabled:true}); await page.goto('/admin/modulos');
  await page.getByRole('button',{name:'Personalizados / 3D'}).click();
  await expect(page.getByRole('heading',{name:'Calculadora de impressão 3D'})).toBeVisible();
  await page.getByLabel('Preço final por unidade (R$)',{exact:true}).first().fill('42.50');
  await page.getByRole('button',{name:'Usar no orçamento'}).click();
  await expect(page.getByLabel('Preço final por unidade (R$)',{exact:true}).nth(1)).toHaveValue('42.50');
});

test('catálogo de eventos desativado não expõe ofertas',async({page})=>{
  await mockBackend(page); await page.goto(`/modulos/eventos/${STORE}`);
  await expect(page.getByText('Esta loja ainda não disponibilizou ofertas para eventos.')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('cliente revisa combo, remove fornecedor e recebe um código e Pix do vendedor no celular',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await mockBackend(page,{enabled:true});
  const moduleCalls:any[]=[];
  const items=[{id:'i-a',name:'Doces',kind:'product',store_id:STORE,quantity:2,total_cents:1800,status:'active',urgent:false,urgency:'not_needed'},
    {id:'i-b',name:'Chaveiro',kind:'printing3d',store_id:'supplier-b',quantity:1,total_cents:2000,status:'active',urgent:false,urgency:'not_needed'}];
  const order:any={id:ORDER,code:456,seller_store_id:STORE,status:'draft',total_cents:3800,charged_cents:0,paid_cents:0,expires_at:new Date(Date.now()+3600000).toISOString(),refund_due_cents:0,pix:null,items};
  await page.route('**/rest/v1/rpc/food_modules_catalog',route=>route.fulfill({json:{store:{name:'Loja de eventos'},offers:[],combos:[{id:STORE,name:'Festa completa',version:1,items:[{id:'i-a',name:'Doces',quantity:2,price_cents:1000,discount_bps:1000,lead_hours:48},{id:'i-b',name:'Chaveiro',quantity:1,price_cents:2000,discount_bps:0,lead_hours:48}]}]}}));
  await page.route('**/functions/v1/food-modules-public',async route=>{
    const body=route.request().postDataJSON(); moduleCalls.push(body);
    if(body.action==='remove') { order.items.find((i:any)=>i.id===body.data.item_id).status='removed'; order.total_cents=1800; }
    if(body.action==='freeze') { order.status='payment_pending'; order.charged_cents=order.total_cents; order.pix={receiptMode:'key',key:'seller@example.invalid',receiver:'Loja vendedora',city:'Linhares'}; }
    await route.fulfill({json:order});
  });
  await page.goto(`/modulos/eventos/${STORE}`);
  await page.getByRole('radio',{name:/Festa completa/}).check();
  await page.getByLabel('Seu nome').fill('Cliente de evento'); await page.getByLabel('WhatsApp',{exact:true}).fill('11999999999');
  await page.getByLabel('Data e horário',{exact:true}).fill('2030-10-21T14:00');
  await page.getByLabel('Término do evento / retirada do aluguel').fill('2030-10-21T18:00');
  await page.getByRole('button',{name:'Revisar pedido e valores'}).click();
  await expect(page.getByRole('heading',{name:'Pedido FW-E456',exact:true})).toBeVisible();
  await page.locator('article').filter({hasText:'Chaveiro'}).getByRole('button',{name:'Remover item'}).click();
  await expect(page.getByRole('heading',{name:'Total vigente: R$ 18,00'})).toBeVisible();
  await page.getByRole('button',{name:'Concluir revisão e gerar Pix'}).click();
  await expect(page.getByRole('heading',{name:'Pix para Loja vendedora'})).toBeVisible();
  expect(moduleCalls.find(c=>c.action==='freeze').data.expected_cents).toBe(1800);
  await expect(page.getByLabel('Pix Copia e Cola')).toHaveValue(/seller@example.invalid/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2)).toBe(true);
});

for(const fulfillment of ['pickup','delivery']) {
  test(`checkout normal Doce Lua ${fulfillment} e Pix permanece no endpoint legado`,async({page})=>{
    const {writes}=await mockBackend(page);
    await page.goto('/doce-lua/produto/brigadeiro-teste');
    await page.getByRole('button',{name:'Adicionar ao carrinho',exact:true}).click();
    await expect(page).toHaveURL(/carrinho/);
    await page.goto('/doce-lua/finalizar');
    await page.getByRole('button',{name:fulfillment==='pickup'?/Retirada Buscar/:/Delivery Receber/}).click();
    await page.getByLabel('Nome',{exact:true}).fill('Cliente de teste');
    await page.getByLabel(/WhatsApp/).first().fill('11999999999');
    if(fulfillment==='delivery') {
      await page.getByLabel('Bairro / área').selectOption({label:'Centro · R$ 5,00'});
      await page.getByLabel('Rua',{exact:true}).fill('Rua de teste');
      await page.getByLabel('Número',{exact:true}).fill('10');
    }
    await page.getByRole('button',{name:'PIX',exact:true}).click();
    const submit=page.getByRole('button',{name:/Registrar pedido|Finalizar/}).filter({visible:true}).first();
    await submit.click();
    await expect(page).toHaveURL(new RegExp(ORDER));
    await expect(page.getByText('Aguardando confirmação do PIX pela loja',{exact:true})).toBeVisible();
    const calls=writes.filter(x=>x.url.endsWith('/food-public-checkout'));
    expect(calls).toHaveLength(1); expect(calls[0].body.payload.delivery_type).toBe(fulfillment);
    expect(calls[0].body.payload.payment_method).toBe('pix');
    expect(writes.filter(x=>x.url.endsWith('/food-modules-public'))).toHaveLength(0);
  });
}

test('Master com MFA consulta a composição de todas as lojas do pedido',async({page})=>{
  await mockBackend(page,{auth:true,enabled:true,master:true});
  const own={id:'part-a',order_id:ORDER,store_id:STORE,code:789,total_cents:1800,status:'active',urgency:'not_needed'};
  const supplier={...own,id:'part-b',store_id:'supplier-b',total_cents:2000};
  await page.route(/\/rest\/v1\/food_module_orders\?/,r=>r.fulfill({json:[{id:ORDER,code:789,seller_store_id:STORE,total_cents:3800,charged_cents:3800,paid_cents:3800,status:'paid',customer_name:'Cliente teste'}]}));
  await page.route(/\/rest\/v1\/food_module_order_parts\?/,r=>r.fulfill({json:r.request().url().includes('order_id=')?[own,supplier]:[own]}));
  await page.route(/\/rest\/v1\/food_module_order_items\?/,r=>r.fulfill({json:r.request().url().includes('order_id=')?[{id:'item-a',part_id:'part-a',order_id:ORDER,store_id:STORE,quantity:2,total_cents:1800,status:'active',snapshot:{name:'Doces Master'}},{id:'item-b',part_id:'part-b',order_id:ORDER,store_id:'supplier-b',quantity:1,total_cents:2000,status:'active',snapshot:{name:'Chaveiro Master'}}]:[]}));
  await page.route(/\/rest\/v1\/food_module_receivables\?/,r=>r.fulfill({json:r.request().url().includes('part_id=')?[{part_id:'part-b',store_id:'supplier-b',amount_cents:2000,settled_cents:0,status:'pending'}]:[]}));
  await page.goto('/admin-master/modulos');
  await page.getByRole('button',{name:'Pedidos e valores',exact:true}).click();
  await page.getByRole('button',{name:'Consultar composição completa'}).click();
  await expect(page.getByText(/Chaveiro Master/)).toBeVisible();
  await expect(page.getByText(/Doces Master/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Registrar repasse feito'})).toBeVisible();
});
