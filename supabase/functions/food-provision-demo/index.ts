import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
// shared_future: opt-in exclusivo de homologação. Nunca registrar corpo, token, senha ou link.
const fixtures={food:['Sabor da Vila','sabor-da-vila','Prato da casa'],florist:['Jardim Encantado','jardim-encantado','Buquê Jardim'],retail:['Loja Horizonte','loja-horizonte','Bolsa Horizonte'],rentals:['Festa Nuvem','festa-nuvem','Locação de brinquedo'],personal:['Movimento Ativo','movimento-ativo','Consultoria inicial'],nutrition:['Equilíbrio Nutri','equilibrio-nutri','Consulta inicial'],creator:['Studio Prisma','studio-prisma','Guia digital']} as const;
type Segment=keyof typeof fixtures;
const defaultModules:Record<Segment,string[]>={food:[],florist:['florist'],retail:[],rentals:['clients','appointments'],personal:['clients','appointments','training'],nutrition:['clients','appointments','nutrition'],creator:['creator']};
const blocked=new Set(['elttryavkeartoxgdgse','vnpoinodvchmmbyxpacj']);
const fail=(code:string,status=400)=>Object.assign(new Error(code),{status});
const requireValue=(test:unknown,code:string,status=400)=>{if(!test)throw fail(code,status)};
const data=<T>(result:{data:T;error:unknown},code:string):T=>{if(result.error)throw fail(code,503);return result.data};
const authOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
Deno.serve(async req=>{
 let cors:Record<string,string>={Vary:'Origin','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 try{
  const url=Deno.env.get('SUPABASE_URL')||'',ref=Deno.env.get('DEMO_PROJECT_REF')||'',origin=Deno.env.get('DEMO_APP_ORIGIN')||'',environment=Deno.env.get('DEMO_ENVIRONMENT')||'';
  requireValue(Deno.env.get('DEMO_PROVISIONING_ENABLED')==='true'&&['development','staging'].includes(environment),'DEMO_DISABLED',503);
  requireValue(/^[a-z0-9]{20}$/.test(ref)&&!blocked.has(ref)&&url===`https://${ref}.supabase.co`,'PROJECT_BLOCKED',403);
  let app:URL;try{app=new URL(origin)}catch{throw fail('ORIGIN_INVALID',403)}
  requireValue(app.origin===origin&&!app.username&&!app.password&&(app.protocol==='https:'||app.protocol==='http:'&&['localhost','127.0.0.1'].includes(app.hostname))&&!['vendeweb.com.br','www.vendeweb.com.br','academia.joseluizacama.workers.dev'].includes(app.hostname),'ORIGIN_INVALID',403);
  requireValue(req.headers.get('Origin')===origin,'ORIGIN_DENIED',403);
  cors={...cors,'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  requireValue(req.method==='POST','METHOD_NOT_ALLOWED',405);
  const anon=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  requireValue(anon&&secret,'SERVER_CONFIG_MISSING',503);
  const authorization=req.headers.get('Authorization')||'';requireValue(/^Bearer\s+\S+$/.test(authorization),'AUTH_REQUIRED',401);
  const caller=createClient(url,anon!,{...authOptions,global:{headers:{Authorization:authorization}}});
  const admin=createClient(url,secret!,authOptions);
  const token=authorization.replace(/^Bearer\s+/,'');
  const user=data(await caller.auth.getUser(token),'AUTH_REQUIRED').user;
  requireValue(user,'AUTH_REQUIRED',401);
  const aal=data(await caller.auth.mfa.getAuthenticatorAssuranceLevel(token),'MFA_REQUIRED');
  requireValue(aal.currentLevel==='aal2','MFA_REQUIRED',403);
  const master=data(await admin.from('food_platform_admins').select('id').eq('user_id',user!.id).eq('active',true).maybeSingle(),'MASTER_LOOKUP_FAILED');
  requireValue(master,'MASTER_REQUIRED',403);
  const status=data(await admin.rpc('food_test_provisioning_status'),'PROVISIONING_RPC_MISSING');
  requireValue(status?.enabled===true&&status.environment===environment&&status.schema_version===1,'PROVISIONING_DISABLED',503);
  const raw=await req.text();requireValue(raw.length<=2048,'REQUEST_TOO_LARGE',413);
  let request:Record<string,unknown>;try{request=JSON.parse(raw)}catch{throw fail('INVALID_JSON')}
  requireValue(request&&typeof request==='object'&&!Array.isArray(request),'INVALID_JSON');
  const make=(segment:unknown,slot:unknown)=>{
   requireValue(typeof segment==='string'&&Object.prototype.hasOwnProperty.call(fixtures,segment)&&Number.isInteger(slot)&&Number(slot)>=1&&Number(slot)<=3,'INVALID_SELECTION');
   const [base,tag,product]=fixtures[segment as Segment];const suffix=slot===1?'':`-${slot}`;const slug=`test-vendeweb-${tag}${suffix}`;
   return {segment,slot,name:`${base}${suffix?' (teste '+slot+')':''}`,slug,email:`vendeweb.qa.${tag}${suffix}@example.invalid`,catalog:[{name:product,category:'Demonstração',price:30,description:'Produto fictício de homologação; sem cobrança real.'}]};
  };
  if(request.action==='preview'){
   requireValue(Array.isArray(request.segments)&&request.segments.length>0&&request.segments.length<=7&&new Set(request.segments).size===request.segments.length&&Number.isInteger(request.count)&&Number(request.count)>=1&&Number(request.count)<=3,'INVALID_SELECTION');
   return reply({environment,projectRef:ref,items:request.segments.flatMap(segment=>Array.from({length:Number(request.count)},(_,i)=>({...make(segment,i+1),status:'NOT_CREATED'})))});
  }
  requireValue(['create','access'].includes(String(request.action)),'ACTION_INVALID');
  const item=make(request.segment,request.slot);
  let owner=null;
  for(let page=1;page<=100;page++){
   const users=data(await admin.auth.admin.listUsers({page,perPage:1000}),'USER_LOOKUP_FAILED');
   owner=users.users.find((entry:{email?:string})=>entry.email?.toLowerCase()===item.email);
   if(owner||users.users.length<1000)break;
  }
  if(!owner&&request.action==='create'){
   const password=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')+'Aa!9';
   owner=data(await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,app_metadata:{vendeweb_test_fixture:'vendeweb-test-v1',fixture_slug:item.slug}}),'USER_CREATE_FAILED').user;
  }
  requireValue(owner?.id,'OWNER_MISSING',409);
  requireValue(owner.app_metadata?.vendeweb_test_fixture==='vendeweb-test-v1'&&owner.app_metadata?.fixture_slug===item.slug,'OWNER_NOT_FIXTURE',409);
  const business=data(await admin.rpc('food_provision_test_business',{p_owner:owner.id,p_slug:item.slug,p_name:item.name,p_segment:item.segment,p_catalog:item.catalog,p_extra_modules:[]}),'STORE_CREATE_FAILED');
  const storeId=business?.store_id;requireValue(storeId,'STORE_NOT_CONFIRMED',503);
  // Um link descartável verifica autenticação real. Nenhuma senha ou link é registrado.
  const loginLink=data(await admin.auth.admin.generateLink({type:'magiclink',email:item.email,options:{redirectTo:`${origin}/admin`}}),'VALIDATION_LINK_FAILED');
  requireValue(loginLink.user?.id===owner.id&&loginLink.properties?.hashed_token,'VALIDATION_LINK_INVALID',503);
  const session=createClient(url,anon!,authOptions);
  try{
   const login=data(await session.auth.verifyOtp({token_hash:loginLink.properties.hashed_token,type:'email'}),'LOGIN_FAILED');
   requireValue(login.user?.id===owner.id&&login.session,'LOGIN_FAILED',503);
   const member=data(await session.from('food_store_users').select('store_id,role,active').eq('store_id',storeId).eq('user_id',owner.id).maybeSingle(),'MEMBER_READ_FAILED');
   requireValue(member?.active&&member.role==='owner','MEMBER_INVALID',409);
   const businessStatus=data(await session.rpc('food_business_status',{p_store:storeId}),'BUSINESS_STATUS_FAILED');
   requireValue(businessStatus?.profile?.primary_segment===item.segment,'SEGMENT_INVALID',409);
   requireValue(defaultModules[item.segment as Segment].every(code=>businessStatus.modules?.some((m:{code:string;effective:boolean})=>m.code===code&&m.effective)),'MODULES_INCOMPLETE',409);
   if(['rentals','personal','nutrition'].includes(item.segment as string)){
    const serviceName=item.segment==='rentals'?'Locação de brinquedo':item.segment==='personal'?'Consultoria inicial':'Consulta inicial';
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fixture-service:'+item.slug))),v=>v.toString(16).padStart(2,'0')).join('');
    const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
    const exists=data(await session.from('food_business_services').select('id').eq('id',id).eq('store_id',storeId).maybeSingle(),'SERVICE_READ_FAILED');
    if(!exists)data(await session.rpc('food_business_operate',{p_store:storeId,p_action:'services.save',p_data:{id,name:serviceName,kind:item.segment==='personal'?'training':item.segment==='nutrition'?'nutrition':'general',price_cents:10000,duration_minutes:60,description:'Serviço fictício de homologação.'}}),'SERVICE_CREATE_FAILED');
    const offers=data(await createClient(url,anon!,authOptions).rpc('food_business_public',{p_store:storeId}),'PUBLIC_SERVICES_FAILED');
    requireValue(offers?.services?.some((service:{name:string})=>service.name===serviceName),'PUBLIC_SERVICES_INCOMPLETE',409);
   }
   const storefront=data(await createClient(url,anon!,authOptions).rpc('food_get_public_storefront_v1',{p_slug:item.slug,p_hostname:null}),'STOREFRONT_READ_FAILED');
   requireValue(storefront?.found&&storefront.store?.id===storeId&&storefront.products?.some((p:{name:string;store_id:string})=>p.name===item.catalog[0].name&&p.store_id===storeId),'STOREFRONT_INVALID',409);
  }finally{await session.auth.signOut({scope:'local'})}
  if(request.action==='access'){
   requireValue(business.existing===true,'FIXTURE_MARKER_INVALID',409);
   const link=data(await admin.auth.admin.generateLink({type:'magiclink',email:item.email,options:{redirectTo:`${origin}/admin`}}),'ACCESS_LINK_FAILED').properties?.action_link;
   requireValue(link&&new URL(link).origin===url,'ACCESS_LINK_INVALID',503);
   return reply({name:item.name,email:item.email,accessLink:link});
  }
  return reply({segment:item.segment,slot:item.slot,name:item.name,email:item.email,slug:item.slug,storeId,status:'PERSISTED_LOGIN_VALIDATED',storefrontUrl:`${origin}/${item.slug}`,adminUrl:`${origin}/admin`,existing:business.existing===true});
 }catch(error){return reply({error:'Não foi possível concluir esta loja; revise a falha e tente somente este item.',code:error instanceof Error?error.message:'FAILED'},Number((error as {status?:number})?.status)||503)}
});
