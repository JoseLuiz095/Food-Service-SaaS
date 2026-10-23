# SOLICITAÇÃO SUPABASE — VENDEWEB

## A. Identificação

- Funcionalidade: preferências de push administrativo (`core`).
- Objetivo: impedir envio quando o backend não consegue verificar as preferências da loja.
- Projeto indicado: `elttryavkeartoxgdgse` / https://elttryavkeartoxgdgse.supabase.co. Ambiente **não confirmado**. Confirmar o alvo real antes de publicar.
- Repositório: https://github.com/JoseLuiz095/Food-Service-SaaS ; branch da correção: `codex/evolucao-operacional`.
- Arquivo: `supabase/functions/food-send-push/index.ts`. Código completo da alteração ao final.
- Estado: implementado e testado localmente; **não publicado nem validado no Supabase remoto**. A sessão de desenvolvimento não possui permissão para consultar o projeto.
- Dependências: tabelas `food_stores`, `food_push_subscriptions`; segredos de servidor já existentes SUPABASE_URL, SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY e VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT. Não solicitar nem transmitir seus valores na conversa.

## B. Diagnóstico

A versão anterior ignorava o `error` da consulta `food_stores.maybeSingle()`. Se a leitura falhasse ou a loja não existisse, `storeSettings` ficava vazio e o código continuava para buscar inscrições e enviar notificações. Isso poderia desrespeitar as preferências cadastradas.

Comportamento esperado: erro na consulta retorna HTTP503 sem consultar inscrições nem enviar push; loja inexistente retorna404; preferência desativada mantém200 com `sent:0`/`skipped:disabled_by_store`; preferências habilitadas seguem o transporte atual.

## C. Alteração necessária

- Somente atualização da Edge Function `food-send-push` com o código integral abaixo, após comparar com a versão remota atual para preservar mudanças posteriores.
- Nenhuma tabela/coluna/FK/constraint/índice/RPC/trigger/policy RLS nova.
- Não modificar permissões para resolver falha de leitura. A autenticação privilegiada do endpoint continua exclusivamente no servidor.
- Esta correção não implementa fila durável, novas mensagens de segmento, consentimento de marketing ou retries automáticos. Não anunciar esses recursos como entregues.

## D. Implementação

1. Confirmar projeto, ambiente, versão publicada e diff da função; verificar os dois campos de preferência e os objetos existentes.
2. Não gerar migration SQL: o contrato de schema não muda.
3. Publicar somente `food-send-push` no ambiente autorizado. Reutilizar segredos existentes sem imprimi-los. Descobrir as opções da versão de CLI/MCP utilizada em vez de presumir flags.
4. Preservar configuração JWT/autenticação que a função e o checkout utilizam. Não adicionar chave privilegiada ao cliente nem publicar endpoints sem proteção.
5. Registrar a versão/deployment da Edge Function executada e testar o endpoint correspondente. Não declarar publicação por ter mesclado o PR.

## E. Segurança e recuperação

- Autorização existente cobre desenvolvimento/homologação; produção exige aprovação específica.
- Necessário acesso autorizado de leitura de schema/logs/versão da função e publicação da função no projeto alvo. Não é necessário mudar RLS nem conceder acesso adicional a tabelas públicas.
- Sem mudança de dados e sem necessidade de backup de schema. Guardar a versão anterior da função como referência para reversão de código, preservando os controles de preferência em qualquer recuperação.
- Testes usam apenas loja e dispositivo fictícios/controlados. Não enviar notificações para clientes ou outros lojistas.

## F. Validação

Metadados SQL:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='food_stores'
  and column_name in ('notifications_new_order_enabled','notifications_desktop_enabled');
select to_regclass('public.food_push_subscriptions');
```

- Testes locais já executados no código real do handler com fronteiras Deno/DB/web-push interceptadas: erro de preferência→503/nenhum envio; loja ausente→404; cada preferência falsa→200/nenhum envio; ambas verdadeiras→transporte acionado. Não são evidência de publicação remota.
- Executar `npm run test:notifications` e comparar a versão remota publicada com esta fonte.
- No ambiente remoto autorizado, verificar loja de teste inexistente e loja fictícia com notificações desativadas: respostas esperadas404 e200/zero envios, respectivamente. Restaurar configurações de teste alteradas; não desativar segurança ou causar falha de banco para simular o503.
- Validar rejeição401 sem autenticação privilegiada. Quando necessário, um envio positivo só deve ocorrer para dispositivo de teste com opt-in e autorização, por mecanismo interno seguro; nunca exibir a credencial de serviço.
- Logs/respostas não devem incluir detalhes privados do erro de consulta. Verificar que o checkout continua registrando o pedido mesmo se o push falhar.

## G. Retorno esperado

Project ref e ambiente; estado `publicada / bloqueada / divergente`; diff/versão/deployment aplicado; resultados de testes com status HTTP e contadores de envio; falhas e pendências. Nenhuma credencial.

## Código completo proposto — comparar com remoto antes de publicar

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import * as webPushModule from 'npm:web-push@3.6.7';

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const webpush = (webPushModule as { default?: typeof webPushModule }).default || webPushModule;
const PUSH_CONCURRENCY = 8;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: { 'Content-Type': 'application/json' } });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@foodweb.local';
  const authorization = req.headers.get('Authorization') || '';

  if (!url || !serviceKey || !vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'Notificações push ainda não estão configuradas no servidor.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  if (authorization !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Não autorizado.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json() as {
      store_id?: string;
      title?: string;
      message?: string;
      tag?: string;
      url?: string;
    };
    if (!body.store_id) throw new Error('Loja não informada.');

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data: storeSettings, error: preferencesError } = await admin
      .from('food_stores')
      .select('notifications_new_order_enabled,notifications_desktop_enabled')
      .eq('id', body.store_id)
      .maybeSingle();
    if (preferencesError) {
      return new Response(JSON.stringify({ error: 'Não foi possível verificar as preferências da loja. Nenhuma notificação foi enviada.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    if (!storeSettings) {
      return new Response(JSON.stringify({ error: 'Loja não encontrada. Nenhuma notificação foi enviada.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (storeSettings.notifications_new_order_enabled === false || storeSettings.notifications_desktop_enabled === false) {
      return new Response(JSON.stringify({ ok: true, sent: 0, removed: 0, total: 0, skipped: 'disabled_by_store' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const { data: subscriptions, error } = await admin
      .from('food_push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('store_id', body.store_id)
      .eq('active', true);
    if (error) throw error;

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const payload = JSON.stringify({
      title: body.title || 'Novo pedido na loja',
      body: body.message || 'Há um novo pedido aguardando atendimento.',
      tag: body.tag || `foodweb:${body.store_id}`,
      url: body.url || '/admin/pedidos',
    });
    const deliver = async (subscription: PushSubscriptionRow) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
        return { sent: 1, removed: 0 };
      } catch (sendError) {
        const statusCode = Number((sendError as { statusCode?: number }).statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('food_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', subscription.id);
          return { sent: 0, removed: 1 };
        } else console.warn('Falha ao enviar push:', sendError);
        return { sent: 0, removed: 0 };
      }
    };
    let sent = 0;
    let removed = 0;
    const activeSubscriptions = (subscriptions || []) as PushSubscriptionRow[];
    // Lotes pequenos aceleram o envio para vários administradores sem abrir
    // conexões ilimitadas nem atrasar todo o grupo por um único dispositivo.
    for (let start = 0; start < activeSubscriptions.length; start += PUSH_CONCURRENCY) {
      const results = await Promise.all(activeSubscriptions.slice(start, start + PUSH_CONCURRENCY).map(deliver));
      for (const result of results) {
        sent += result.sent;
        removed += result.removed;
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, removed, total: activeSubscriptions.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Falha ao enviar notificações push.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
});

```
