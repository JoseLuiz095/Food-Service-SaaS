import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const store = '10000000-0000-4000-8000-000000000001';
const category = '20000000-0000-4000-8000-000000000001';
const storeRow = { id:store, slug:'fabriciofitness', name:'FabricioFITNESS', city:'Linhares', state:'ES', active:true, access_status:'online', delivery_enabled:false, pickup_enabled:false, visual_theme:{preset:'foodweb',businessSegment:'fitness'} };
const categoryRow = { id:category, store_id:store, name:'Produtos', slug:'produtos', description:null, active:true, sort_order:1 };
const productRow = { id:'30000000-0000-4000-8000-000000000001', store_id:store, category_id:category, name:'Produto publicado', slug:'produto-publicado', description:'Descrição confirmada no servidor', price:50, promotional_price:null, active:true, featured:false, made_to_order:false, production_days:0, stock_status:'available', availability_status:'available', track_stock:false, sort_order:1 };
const trainer = {user_id:'40000000-0000-4000-8000-000000000001',name:'Profissional de Educação Física',council:'CREF',registration:'000001-G/ES'};
const nutritionist = {user_id:'40000000-0000-4000-8000-000000000002',name:'Profissional de Nutrição',council:'CRN',registration:'000001/ES'};

async function mockStore(page:Page, products:unknown[] = [productRow], services:unknown[] = [], links:unknown[] = [], storeOverride:Record<string,unknown> = {}) {
  await page.route('https://*.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    const result = path.endsWith('/food_get_public_storefront_v1')
      ? {found:true,status:'online',store:{...storeRow,...storeOverride},categories:[categoryRow],products,product_images:[],option_groups:[],option_items:[],product_option_groups:[],product_variants:[],addons:[],product_addons:[],delivery_zones:[]}
      : path.endsWith('/food_business_public') ? {services,links} : [];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
}

for (const width of [320, 390, 768, 1366]) test(`Fitness catalog is read only and responsive at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await mockStore(page);
  await page.goto('/fabriciofitness');
  await expect(page.getByRole('heading',{name:'Produtos da loja'})).toBeVisible();
  await expect(page.getByRole('link',{name:/Produto publicado/})).toBeVisible();
  await page.getByPlaceholder('Buscar produtos, serviços e conteúdos').fill('inexistente');
  await expect(page.getByText('Nenhum produto corresponde à busca.')).toBeVisible();
  await page.getByPlaceholder('Buscar produtos, serviços e conteúdos').fill('publicado');
  await page.getByRole('link',{name:/Produto publicado/}).click();
  await expect(page.getByRole('heading',{name:'Produto publicado'})).toBeVisible();
  await expect(page.getByText('Compra online ainda não disponível para este item.')).toBeVisible();
  await expect(page.getByRole('button',{name:/Adicionar ao carrinho|Comprar agora/})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.goto('/fabriciofitness/carrinho');
  await expect(page).toHaveURL(/\/fabriciofitness$/);
});

test('draft products and missing products never display a purchasable detail', async ({page}) => {
  await mockStore(page, []);
  await page.goto('/fabriciofitness');
  await expect(page.getByText('Ainda não há produtos publicados nesta loja.')).toBeVisible();
  await page.goto('/fabriciofitness/produto/produto-publicado');
  await expect(page.getByRole('heading',{name:'Produto indisponível'})).toBeVisible();
});

test('confirmed general service is consultable without offering a reservation', async ({page}) => {
  await mockStore(page, [], [{id:'service-1',name:'Avaliação física',description:'Descrição aprovada',price_cents:10000,duration_minutes:60,kind:'general',professional:trainer}]);
  await page.goto('/fabriciofitness');
  await expect(page.getByRole('heading',{name:'Avaliação física'})).toBeVisible();
  await expect(page.getByText(/Profissional de Educação Física.*CREF 000001-G\/ES/)).toBeVisible();
  await expect(page.getByText('Agendamento online ainda não disponível para este serviço.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Ver horários'})).toHaveCount(0);
});

test('type filters keep product, service and content interactions distinct', async ({page}) => {
  await mockStore(page, [productRow], [{id:'service-1',name:'Avaliação física',description:'Consulta presencial',price_cents:10000,duration_minutes:60,kind:'general',professional:trainer}]);
  await page.goto('/fabriciofitness');
  await page.getByLabel('Tipo').selectOption('services');
  await expect(page.getByRole('heading',{name:'Avaliação física'})).toBeVisible();
  await expect(page.getByRole('link',{name:/Produto publicado/})).toHaveCount(0);
  await page.getByLabel('Tipo').selectOption('products');
  await expect(page.getByRole('heading',{name:'Avaliação física'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:/Produto publicado/})).toBeVisible();
});

for (const width of [320,390,768,1366]) test(`multi-segment storefront filters offers at ${width}px`,async ({page})=>{
  await page.setViewportSize({width,height:900});
  await mockStore(page,[productRow],[{id:'consult-1',name:'Consulta nutricional',description:'Atendimento individual',price_cents:10000,duration_minutes:45,kind:'nutrition',professional:nutritionist}],[{id:'link-1',label:'Guia público',url:'https://example.com/guia'}],{visual_theme:{preset:'foodweb',businessSegment:'nutrition'}});
  await page.goto('/fabriciofitness');
  await page.getByLabel('Tipo').selectOption('consultations');
  await expect(page.getByRole('heading',{name:'Consulta nutricional'})).toBeVisible();
  await expect(page.getByText(/Profissional de Nutrição.*CRN 000001\/ES/)).toBeVisible();
  await expect(page.getByRole('link',{name:/Produto publicado/})).toHaveCount(0);
  await page.getByLabel('Tipo').selectOption('content');
  await expect(page.getByRole('link',{name:/Guia público/})).toHaveAttribute('href','https://example.com/guia');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});

test('professional services without a named and registered provider stay hidden',async ({page})=>{
  await mockStore(page,[],[{id:'consult-1',name:'Consulta sem prestador',description:'Atendimento',price_cents:10000,duration_minutes:45,kind:'nutrition'}],[],{visual_theme:{preset:'foodweb',businessSegment:'nutrition'}});
  await page.goto('/fabriciofitness');
  await page.getByLabel('Tipo').selectOption('consultations');
  await expect(page.getByRole('heading',{name:'Consulta sem prestador'})).toHaveCount(0);
  await expect(page.getByText('Nenhuma oferta deste tipo publicada no momento.')).toBeVisible();
});

test('nutrition consultation in the same Fitness storefront identifies its own CRN provider',async ({page})=>{
  await mockStore(page,[],[{id:'consult-1',name:'Consulta nutricional',description:'Atendimento individual',price_cents:12000,duration_minutes:45,kind:'nutrition',professional:nutritionist}]);
  await page.goto('/fabriciofitness');
  await page.getByLabel('Tipo').selectOption('consultations');
  await expect(page.getByRole('heading',{name:'Consulta nutricional'})).toBeVisible();
  await expect(page.getByText(/Profissional de Nutrição.*CRN 000001\/ES/)).toBeVisible();
  await expect(page.getByText('Agendamento e pagamento online ainda não disponíveis para esta consulta.')).toBeVisible();
});

for (const width of [320,390,768,1366]) test(`student can configure and disable personal reminders at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const user='50000000-0000-4000-8000-000000000001';
  const reminders:any[]=[];
  const messages:any[]=[{id:'message-1',publication_id:'publication-1',title:'Comunicado de teste',body:'Mensagem aprovada pela profissional.',category:'commercial',status:'sent',sent_at:'2026-10-30T08:00:00Z',author_name:'Nutricionista Teste',author_council:'CRN',author_registration:'000001/ES'}];
  const nutritionist='60000000-0000-4000-8000-000000000001';
  let messageEnabled=false;
  const calls:{path:string;body:any}[]=[];
  await page.addInitScript(({user})=>{
    const payload={sub:user,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
    const token='header.'+btoa(JSON.stringify(payload))+'.signature';
    localStorage.setItem('foodservice.auth.v1',JSON.stringify({access_token:token,refresh_token:'test-only-refresh',expires_at:payload.exp,expires_in:3600,token_type:'bearer',user:{id:user,email:'student@example.invalid',aud:'authenticated',app_metadata:{},user_metadata:{}}}));
  },{user});
  await page.route('https://*.supabase.co/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;const body=request.postData()?JSON.parse(request.postData()!):null;
    calls.push({path,body});let result:any=[];
    if(path==='/auth/v1/user')result={id:user,email:'student@example.invalid',app_metadata:{},user_metadata:{}};
    else if(path.endsWith('/food_get_public_storefront_v1'))result={found:true,status:'online',store:{...storeRow},categories:[categoryRow],products:[productRow],product_images:[],option_groups:[],option_items:[],product_option_groups:[],product_variants:[],addons:[],product_addons:[],delivery_zones:[]};
    else if(path.endsWith('/food_resolve_storefront_status'))result={found:true,id:store,name:storeRow.name,status:'online'};
    else if(path.endsWith('/food_business_public'))result={services:[],links:[],publications:[],primary_segment:'fitness'};
    else if(path.endsWith('/food_fitness_student_reminders_list'))result={reminders:[...reminders],inbox:[]};
    else if(path.endsWith('/food_fitness_student_authorization_list'))result={professionals:[{user_id:nutritionist,name:'Nutricionista Teste',kind:'nutrition',council:'CRN',registration:'000001/ES',authorized:false,message_enabled:messageEnabled}]};
    else if(path.endsWith('/food_fitness_student_messages_list'))result=[...messages];
    else if(path.endsWith('/food_fitness_my_appointments'))result={appointments:[]};
    else if(path.endsWith('/food_fitness_list_workouts'))result=[];
    else if(path.endsWith('/food_fitness_student_reminder_save')){const row={id:'reminder-1',kind:body.p_kind,label:body.p_label,reminder_time:body.p_time,timezone:body.p_timezone,weekdays:body.p_weekdays,channel:body.p_channel,status:'active',paused_until:null};reminders.splice(0,reminders.length,row);result={id:row.id,status:row.status};}
    else if(path.endsWith('/food_fitness_student_reminder_action')){const row=reminders.find(item=>item.id===body.p_id);if(row)row.status=body.p_action==='pause'?'paused':body.p_action==='cancel'?'cancelled':'active';result={id:body.p_id,status:row?.status};}
    else if(path.endsWith('/food_fitness_student_message_permission_set')){messageEnabled=body.p_enabled;result={professional_user_id:nutritionist,enabled:messageEnabled};}
    else if(path.endsWith('/food_fitness_student_message_mark_seen')){const item=messages.find(message=>message.id===body.p_delivery);if(item)item.status='seen';result={id:body.p_delivery,status:'seen'};}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto('/fabriciofitness');
  await expect(page.getByRole('heading',{name:'Meus lembretes e permissões'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await expect(page.getByText('Comunicado de teste')).toBeVisible();
  await page.getByRole('button',{name:'Marcar como lida'}).click();
  await expect(page.getByText('Mensagem aprovada pela profissional.')).toBeVisible();
  const messagePermission=page.getByLabel('Receber mensagens deste profissional');
  await messagePermission.click();
  await expect(messagePermission).toBeChecked();
  expect(calls.find(call=>call.path.endsWith('/food_fitness_student_message_permission_set'))?.body).toMatchObject({p_professional:nutritionist,p_enabled:true});
  if(width===390){const accessibility=await new AxeBuilder({page}).include('.fitness-student-preferences').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();expect(accessibility.violations.filter(item=>item.impact==='critical'||item.impact==='serious').map(item=>item.id)).toEqual([]);}
  await page.getByLabel('Rotina').selectOption('hydration');
  await page.getByLabel('Nome do lembrete').fill('Minha pausa para água');
  await page.getByLabel('Horário local').fill('07:30');
  await page.getByLabel('Canal').selectOption('in_app');
  await page.getByRole('button',{name:'Adicionar lembrete'}).click();
  await expect(page.getByText('Minha pausa para água')).toBeVisible();
  const saved=calls.find(call=>call.path.endsWith('/food_fitness_student_reminder_save'));
  expect(saved?.body).toMatchObject({p_kind:'hydration',p_time:'07:30',p_channel:'in_app'});
  await page.getByLabel('Pausar até').fill('2026-11-01T09:00');
  await page.getByRole('button',{name:'Pausar'}).click();
  await expect(page.getByText(/Pausado/)).toBeVisible();
  await page.getByRole('button',{name:'Desligar'}).click();
  await expect(page.getByText(/Desligado/)).toBeVisible();
});
