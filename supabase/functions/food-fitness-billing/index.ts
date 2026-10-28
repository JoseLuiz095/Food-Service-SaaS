import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { createFitnessBillingHandler } from './handler.ts';

// Deploy separately to staging. Asaas requests are pinned to sandbox in handler.ts.
Deno.serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !service) return new Response(JSON.stringify({ error: 'SERVER_NOT_CONFIGURED' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const handler = createFitnessBillingHandler({ env: (name) => Deno.env.get(name), rpc: async (name, args) => await admin.rpc(name, args), fetch });
  return handler(request);
});
