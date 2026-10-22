import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { validatePublicEnvironment } from './public-env-validation.mjs';

const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
assert.deepEqual(validatePublicEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }), []);
assert.deepEqual(validatePublicEnvironment({ VITE_SUPABASE_ANON_KEY: jwt('anon') }), []);
assert.ok(validatePublicEnvironment({ VITE_SUPABASE_ANON_KEY: jwt('service_role') }).length);
assert.ok(validatePublicEnvironment({ VITE_SUPABASE_ANON_KEY: jwt('authenticated') }).length);
assert.ok(validatePublicEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' }).length);
assert.ok(validatePublicEnvironment({ VITE_TURNSTILE_SECRET_KEY: 'example' }).length);
assert.ok(validatePublicEnvironment({ VITE_SUPABASE_ANON_KEY: jwt('anon'), VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' }).length);
assert.ok(validatePublicEnvironment({ VITE_SUPABASE_ANON_KEY: jwt('anon'), VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }).length);
assert.ok(validatePublicEnvironment({ VITE_API_KEY: 'sb_secret_example' }).length);

const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create function public.food_seed_financial_categories(uuid) returns void language plpgsql security definer as $$begin return; end$$;
    create function public.food_get_public_storefront_v1_base(text,text) returns jsonb language sql security definer as $$select '{"found":true}'::jsonb$$;
    create function public.food_get_public_storefront_v1(text,text) returns jsonb language sql security definer as $$select public.food_get_public_storefront_v1_base($1,$2)$$;
    grant execute on all functions in schema public to public,anon,authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/20261022144035_food_internal_rpc_permissions.sql', 'utf8'));
  for (const role of ['anon', 'authenticated']) {
    const { rows } = await db.query(`select has_function_privilege($1,'public.food_seed_financial_categories(uuid)','execute') as seed,
      has_function_privilege($1,'public.food_get_public_storefront_v1_base(text,text)','execute') as base`, [role]);
    assert.deepEqual(rows[0], { seed: false, base: false });
  }
  await db.exec('set role anon');
  const { rows } = await db.query("select public.food_get_public_storefront_v1('teste',null) as result");
  assert.equal(rows[0].result.found, true);
  await db.exec('reset role; set role service_role');
  await db.query("select public.food_seed_financial_categories('00000000-0000-4000-8000-000000000001')");
  await db.exec(`reset role;
    create table public.food_products(id uuid,party_order_enabled boolean,party_price_per_gram numeric,
      party_package_weight_grams numeric,party_minimum_packages integer,party_lead_time_days integer,
      party_artwork_instructions text,party_artwork_url text,default_order_status text);
    insert into public.food_products values('00000000-0000-4000-8000-000000000001',true,0.1,100,5,3,'Combinar arte',null,'received');
    create or replace function public.food_get_public_storefront_v1_base(text,text) returns jsonb language sql security definer as $stub$
      select jsonb_build_object('found',true,'status','online','store',jsonb_build_object(
        'name','Loja teste','pix_key','public-test-key','opening_hours','{"timezone":"America/Sao_Paulo"}'::jsonb,
        'hide_public_address',true,'billing_document','PRIVATE','billing_phone','PRIVATE','billing_asaas_customer_id','PRIVATE','future_private_field','PRIVATE'),
        'products',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000001','name','Produto','price',10,'stock_quantity',5,'internal_code','PRIVATE')),
        'option_groups',jsonb_build_array(jsonb_build_object('name','Opções')));
    $stub$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261022144600_food_public_store_projection.sql','utf8'));
  await db.exec('set role anon');
  const projection = (await db.query("select public.food_get_public_storefront_v1('teste',null) as result")).rows[0].result;
  assert.equal(projection.store.name,'Loja teste');
  assert.equal(projection.store.pix_key,'public-test-key');
  assert.equal(projection.store.opening_hours.timezone,'America/Sao_Paulo');
  for(const key of ['billing_document','billing_phone','billing_asaas_customer_id','future_private_field','address']) assert.equal(key in projection.store,false);
  assert.equal(projection.products[0].price,10);
  assert.equal(projection.products[0].stock_quantity,5);
  assert.equal(projection.products[0].party_price_per_gram,0.1);
  assert.equal(projection.products[0].party_lead_time_days,3);
  assert.equal('internal_code' in projection.products[0],false);
  assert.equal(projection.option_groups[0].name,'Opções');
  console.log('OK segurança: segredos no frontend rejeitados; auxiliares privados; wrapper público e service_role preservados.');
} finally { await db.close(); }
