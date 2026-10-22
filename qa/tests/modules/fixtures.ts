import type { Page } from '@playwright/test';

export const STORE='00000000-0000-4000-8000-000000000001';
export const PRODUCT='20000000-0000-4000-8000-000000000001';
export const USER='90000000-0000-4000-8000-000000000001';
export const ORG='a0000000-0000-4000-8000-000000000001';
export const ORDER='b0000000-0000-4000-8000-000000000001';
export const opening={timezone:'America/Sao_Paulo',days:Array.from({length:7},(_,day)=>({day,enabled:true,open:'00:00',close:'23:59',breakStart:'',breakEnd:''})),delivery_mode:'own',delivery_start_time:'00:00',pickup_start_time:'00:00',pickup_end_time:'23:59'};
export const store={ id: STORE,slug:'doce-lua',name:'Doce Lua',description:'Loja de teste local',logo_url:'/assets/placeholder-food.svg',
  active:true,access_status:'online',approval_status:'approved',delivery_enabled:true,pickup_enabled:true,show_whatsapp:true,
  whatsapp:'5511999999999',address:'Rua de teste, 1',city:'Linhares',state:'ES',zip_code:'29900-000',pix_enabled:true,
  pix_receipt_mode:'key',pix_key:'test@example.invalid',pix_holder_name:'Doce Lua Teste',show_pix_before_confirmation:true,
  cash_payment_enabled:true,card_payment_enabled:false,confirmation_payment_enabled:false,payment_method_order:['pix','cash'],
  minimum_order:0,opening_hours:opening,allow_scheduled_orders:true,average_preparation_min:0,average_preparation_max:0 };
export const product={ id:PRODUCT,store_id:STORE,category_id:'10000000-0000-4000-8000-000000000001',name:'Brigadeiro teste',slug:'brigadeiro-teste',description:'Produto de teste',price:10,promotional_price:null,active:true,featured:true,made_to_order:false,stock_status:'available',availability_status:'available',track_stock:true,stock_quantity:50,stock_reserved_quantity:0,sort_order:1 };
export const snapshot={ found:true,status:'online',store,categories:[{id:product.category_id,store_id:STORE,name:'Doces',slug:'doces',active:true,sort_order:1}],products:[product],product_images:[],option_groups:[],option_items:[],product_option_groups:[],product_variants:[],addons:[],product_addons:[],delivery_zones:[{id:'50000000-0000-4000-8000-000000000001',store_id:STORE,name:'Centro',city:'Linhares',state:'ES',fee:5,active:true,sort_order:1}] };
export const settings={ store_id:STORE,organization_id:ORG,events_enabled:false,combos_enabled:false,custom_enabled:false,rentals_enabled:false,max_quantity:100,lead_hours:24,urgency_bps:2000 };

export async function mockBackend(page: Page, { auth=false, enabled=false, master=false }: {auth?:boolean;enabled?:boolean;master?:boolean}={}) {
  const writes: {url:string;body:any}[]=[];
  const state={...settings,...(enabled?{events_enabled:true,combos_enabled:true,custom_enabled:true,rentals_enabled:true}:{})};
  await page.addInitScript(() => {
    (window as any).turnstile = { render: (_container: unknown, options: any) => { queueMicrotask(() => options.callback?.('local-test-captcha')); return 'test-widget'; }, remove() {}, reset() {} };
  });
  if (auth) await page.addInitScript(({USER,master})=>{
    const now=Math.floor(Date.now()/1000);
    const encode=(value:unknown)=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const access_token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:USER,role:'authenticated',aal:master?'aal2':'aal1',iat:now,exp:now+3600})}.c2lnbmF0dXJl`;
    localStorage.setItem('foodservice.auth.v1',JSON.stringify({access_token,refresh_token:'test-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:USER,email:'owner@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));
  },{USER,master});
  await page.route('**/*.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const body=req.postDataJSON?.();
    if (req.method()!=='GET') writes.push({url:path,body});
    let data:any=[];
    if(path.endsWith('/food_get_public_storefront_v1')) data=snapshot;
    else if(path.endsWith('/food_resolve_storefront_status')) data={found:true,id:STORE,name:'Doce Lua',status:'online'};
    else if(path.endsWith('/food_stores')) data=[store];
    else if(path.endsWith('/food_store_users')) data=auth?[{id:USER,user_id:USER,store_id:STORE,role:'owner',active:true,must_change_password:false}]:[];
    else if(path.endsWith('/food_platform_admins')) data=master?[{id:USER,user_id:USER,name:'Master de teste',active:true}]:[];
    else if(path.endsWith('/food_products')) data=[product];
    else if(path.endsWith('/food_categories')) data=snapshot.categories;
    else if(path.endsWith('/food_delivery_zones')) data=snapshot.delivery_zones;
    else if(path.endsWith('/food_module_settings')) data=[state];
    else if(path.endsWith('/food_modules_command')) { if(body.p_action==='settings') Object.assign(state,body.p_data); data={id:STORE}; }
    else if(path.endsWith('/food_modules_directory')) data=[];
    else if(path.endsWith('/food-public-checkout')) data={orderId:ORDER,orderNumber:123,total:body?.payload?.delivery_type==='delivery'?15:10};
    else if(path.endsWith('/food_modules_catalog')) data={store:{name:'Loja de eventos'},offers:state.events_enabled?[{id:PRODUCT,name:'Brindes para evento',kind:'printing3d',price_cents:2000,store_id:STORE,max_quantity:10,lead_hours:48,ready_now:false}]:[],combos:[]};
    else if(path.includes('/rpc/food_get_store_billing')) data={};
    else if(path.endsWith('/food_track_public_event_v1') || path.endsWith('/food_mark_public_order_whatsapp_clicked')) data=null;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  return { writes, state };
}
