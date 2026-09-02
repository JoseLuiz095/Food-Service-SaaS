import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const stripFence=(value:string)=>value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const url=Deno.env.get('SUPABASE_URL'); const anon=Deno.env.get('SUPABASE_ANON_KEY'); const service=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const accountId=Deno.env.get('CLOUDFLARE_ACCOUNT_ID'); const aiToken=Deno.env.get('CLOUDFLARE_AI_TOKEN');
    if(req.method==='GET')return json({ok:Boolean(url&&anon&&service),function:'food-finance-document-extract',version:'foodservice-0.3.0',configured:Boolean(url&&anon&&service),aiConfigured:Boolean(accountId&&aiToken)});
    if(!url||!anon||!service)throw new Error('Supabase não configurado.');
    if(!accountId||!aiToken)throw new Error('Leitura automática ainda não configurada. O lançamento manual continua disponível. Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_AI_TOKEN.');

    const authorization=req.headers.get('Authorization')||'';
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await userClient.auth.getUser(); if(userError||!userData.user)return json({error:'Não autenticado.'},401);
    const body=await req.json(); const storeId=String(body.storeId||''); const storagePath=String(body.storagePath||''); const documentId=String(body.documentId||'');
    if(!storeId||!storagePath)throw new Error('Loja e documento são obrigatórios.');
    const {data:allowed,error:allowedError}=await userClient.rpc('food_can_manage_finance',{p_store_id:storeId});
    if(allowedError||allowed!==true)return json({error:'Seu plano ou perfil não permite acessar o financeiro.'},403);
    if(!storagePath.startsWith(`stores/${storeId}/`))return json({error:'Caminho de documento inválido.'},403);

    const {data:file,error:downloadError}=await admin.storage.from('food-finance-documents').download(storagePath); if(downloadError||!file)throw new Error(downloadError?.message||'Não foi possível baixar o documento.');
    const form=new FormData(); form.append('files',file,storagePath.split('/').pop()||'documento'); form.append('conversionOptions',JSON.stringify({output:{format:'text'},image:{descriptionLanguage:'pt'},pdf:{metadata:false}}));
    const mdResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/tomarkdown`,{method:'POST',headers:{Authorization:`Bearer ${aiToken}`},body:form});
    const mdPayload=await mdResponse.json().catch(()=>null) as any;
    if(!mdResponse.ok||!mdPayload?.success)throw new Error(mdPayload?.errors?.[0]?.message||'Não foi possível ler o documento.');
    const extractedText=String(mdPayload?.result?.[0]?.data||'').slice(0,30000);
    if(!extractedText.trim())throw new Error('O documento não retornou texto legível.');

    const prompt=`Você extrai dados para um financeiro gerencial de pequeno negócio de alimentação. Analise o texto abaixo de nota, cupom, boleto ou recibo. Retorne SOMENTE JSON válido, sem markdown, com este formato: {"direction":"expense|income","amount":number|null,"occurredOn":"YYYY-MM-DD|null","documentType":"nfe|nfce|nfse|receipt|boleto|coupon|other","documentNumber":"string|null","counterparty":"string|null","description":"string","categoryName":"string|null","confidence":number}. Não invente valores ausentes. Para compras/notas/boletos normalmente direction=expense. confidence entre 0 e 1. Texto:\n${extractedText}`;
    const aiResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${aiToken}`,'Content-Type':'application/json'},body:JSON.stringify({model:'@cf/google/gemma-4-26b-a4b-it',messages:[{role:'system',content:'Extraia dados estruturados com precisão. Responda apenas JSON.'},{role:'user',content:prompt}],temperature:0.1,max_tokens:700})});
    const aiPayload=await aiResponse.json().catch(()=>null) as any; if(!aiResponse.ok)throw new Error(aiPayload?.errors?.[0]?.message||'A IA não conseguiu interpretar o documento.');
    const content=String(aiPayload?.choices?.[0]?.message?.content||'');
    let suggestion:any={}; try{suggestion=JSON.parse(stripFence(content));}catch{suggestion={description:'Documento lido. Revise os campos antes de salvar.',confidence:0,rawAnswer:content.slice(0,1500)};}
    suggestion.amount=suggestion.amount==null?null:Number(suggestion.amount); suggestion.confidence=Math.max(0,Math.min(1,Number(suggestion.confidence)||0));

    if(documentId){await admin.from('food_financial_documents').update({extraction_status:'processed',extracted_text:extractedText,extracted_json:suggestion,confidence:suggestion.confidence,updated_at:new Date().toISOString()}).eq('id',documentId).eq('store_id',storeId);}
    return json({suggestion,textPreview:extractedText.slice(0,2500)});
  }catch(error){return json({error:error instanceof Error?error.message:'Erro inesperado.'},400);}
});
