import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

type TurnstileResult={success:boolean;hostname?:string;action?:string;'error-codes'?:string[]};
const originSet=()=>new Set(String(Deno.env.get('PUBLIC_APP_ORIGINS')||'').split(',').map((value)=>value.trim().replace(/\/$/,'')).filter(Boolean));
const cleanOrigin=(value:string)=>value.trim().replace(/\/$/,'');
const originAllowed=(origin:string)=>{const configured=originSet();return Boolean(origin)&&configured.size>0&&configured.has(cleanOrigin(origin))};
const hostnameFrom=(origin:string)=>{try{return new URL(origin).hostname.toLowerCase()}catch{return''}};
const clientIp=(req:Request)=>(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'').split(',')[0].trim();
const sha256=async(value:string)=>{const data=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,'0')).join('')};
const headers=(origin:string)=>({
  'Access-Control-Allow-Origin':originAllowed(origin)?(origin||'*'):'null',
  'Access-Control-Allow-Headers':'apikey, content-type',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Vary':'Origin',
  'Content-Type':'application/json',
});
const json=(origin:string,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});
const normalizePhone=(value:string)=>{let digits=String(value||'').replace(/\D/g,'');if((digits.length===10||digits.length===11)&&!digits.startsWith('55'))digits=`55${digits}`;return digits};

async function validateTurnstile(token:string,origin:string,remoteIp:string){
  const secret=Deno.env.get('TURNSTILE_SECRET_KEY')||'';
  if(!secret)throw new Error('Contato público protegido ainda não foi configurado no servidor.');
  if(!token)throw new Error('Conclua a verificação anti-robô.');
  const form=new FormData();form.append('secret',secret);form.append('response',token);if(remoteIp)form.append('remoteip',remoteIp);
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
  const result=await response.json().catch(()=>({success:false})) as TurnstileResult;
  if(!response.ok||!result.success)throw new Error('Não foi possível confirmar a verificação anti-robô. Atualize a página e tente novamente.');
  if(result.action&&result.action!=='marketing')throw new Error('A verificação recebida não corresponde ao contato comercial.');
  const originHost=hostnameFrom(origin);
  if(originHost&&result.hostname&&result.hostname.toLowerCase()!==originHost)throw new Error('A verificação não pertence a este endereço do FoodWeb.');
}

Deno.serve(async(req)=>{
  const origin=req.headers.get('Origin')||'';
  if(req.method==='OPTIONS')return new Response('ok',{status:200,headers:headers(origin)});
  if(req.method!=='POST')return json(origin,{error:'Método não permitido.'},405);
  if(!originAllowed(origin))return json(origin,{error:'Origem não autorizada.',code:'ORIGIN_NOT_ALLOWED'},403);
  try{
    const url=Deno.env.get('SUPABASE_URL')||'';
    const service=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if(!url||!service)throw new Error('Contato comercial indisponível por configuração interna.');
    const body=await req.json().catch(()=>({})) as {token?:string;intent?:string};
    const intent=body.intent==='trial'?'trial':'commercial';
    const remoteIp=clientIp(req);
    await validateTurnstile(String(body.token||''),origin,remoteIp);
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const salt=Deno.env.get('CONTACT_FINGERPRINT_SALT')||Deno.env.get('TURNSTILE_SECRET_KEY')||service.slice(-48);
    const fingerprint=await sha256(`${salt}:${remoteIp||'unknown'}:${req.headers.get('user-agent')||'unknown'}:${cleanOrigin(origin)}`);
    const {error:rateError}=await admin.rpc('food_enforce_public_contact_rate_limit',{p_fingerprint:fingerprint});
    if(rateError){
      const limited=String(rateError.message||'').includes('TOO_MANY_CONTACT_ATTEMPTS');
      return json(origin,{error:limited?'Muitas tentativas de contato. Aguarde alguns minutos e tente novamente.':'Não foi possível validar o limite de contato.'},limited?429:400);
    }
    const {data,error}=await admin.from('food_platform_settings').select('marketing_whatsapp,demo_duration_days').eq('id',1).maybeSingle();
    if(error)throw error;
    const phone=normalizePhone(String(data?.marketing_whatsapp||''));
    if(!phone)throw new Error('WhatsApp comercial ainda não foi configurado pelo Admin Master.');
    const days=Math.max(1,Number(data?.demo_duration_days||30));
    const message=intent==='trial'
      ? `Olá! Tenho interesse em testar o Plano Profissional do FoodWeb por ${days} dias. Gostaria de saber como ativar a demonstração.`
      : 'Olá! Gostaria de saber mais sobre o FoodWeb e os planos disponíveis.';
    return json(origin,{redirectUrl:`https://wa.me/${phone}?text=${encodeURIComponent(message)}`});
  }catch(error){return json(origin,{error:error instanceof Error?error.message:'Erro inesperado.'},400)}
});
