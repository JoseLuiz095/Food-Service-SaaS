import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { createFitnessCheckoutHandler } from './handler.ts';

Deno.serve(async (request: Request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !service) return new Response(JSON.stringify({ error: 'SERVER_NOT_CONFIGURED' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  return createFitnessCheckoutHandler({ env: name => Deno.env.get(name), getUser: token => admin.auth.getUser(token), rpc: async (name, args) => await admin.rpc(name, args), fetch })(request);
});
