import { test, expect, type Page } from '@playwright/test';

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
