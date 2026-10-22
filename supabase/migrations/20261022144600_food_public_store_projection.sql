-- Versão alinhada com o registro da aplicação no Supabase.
-- Corrige a projeção pública sem alterar estoque, preços, pedidos ou dados salvos.
-- Whitelist evita que futuras colunas administrativas virem públicas por acidente.
begin;
create or replace function public.food_get_public_storefront_v1(p_slug text default null, p_hostname text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_payload jsonb;
  v_products jsonb;
  v_store jsonb;
begin
  v_payload := public.food_get_public_storefront_v1_base(p_slug, p_hostname);
  if coalesce(v_payload->>'found', 'false') <> 'true'
     or coalesce(v_payload->>'status', '') <> 'online' then return v_payload; end if;

  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_store
    from jsonb_each(coalesce(v_payload->'store','{}'::jsonb))
    where key = any(array[
      'id','slug','name','description','logo_url','logo_storage_path','cover_url','cover_storage_path',
      'active','access_status','approval_status','address','zip_code','city','state','hide_public_address',
      'pickup_instructions','whatsapp','show_whatsapp','instagram','delivery_enabled','pickup_enabled',
      'minimum_order','opening_hours','allow_scheduled_orders','average_preparation_min','average_preparation_max',
      'pix_enabled','pix_receipt_mode','pix_key_type','pix_key','pix_holder_name','pix_copy_paste',
      'show_pix_before_confirmation','cash_payment_enabled','card_payment_enabled','confirmation_payment_enabled',
      'payment_method_order','storefront_notice','visual_theme'
    ]);
  v_payload := jsonb_set(v_payload,'{store}',v_store,true);

  select coalesce(jsonb_agg(
    (product - 'internal_code') || jsonb_build_object(
      'party_order_enabled', coalesce(p.party_order_enabled, false),
      'party_price_per_gram', p.party_price_per_gram,
      'party_package_weight_grams', p.party_package_weight_grams,
      'party_minimum_packages', coalesce(p.party_minimum_packages, 1),
      'party_lead_time_days', coalesce(p.party_lead_time_days, 0),
      'party_artwork_instructions', p.party_artwork_instructions,
      'party_artwork_url', p.party_artwork_url,
      'default_order_status', coalesce(p.default_order_status, 'received')
    ) order by coalesce((product->>'featured')::boolean, false) desc,
      coalesce((product->>'sort_order')::integer, 0), product->>'name'
  ), '[]'::jsonb) into v_products
    from jsonb_array_elements(coalesce(v_payload->'products','[]'::jsonb)) as entries(product)
    join public.food_products p on p.id::text = entries.product->>'id';
  return jsonb_set(v_payload,'{products}',v_products,true);
end;
$$;
revoke all on function public.food_get_public_storefront_v1(text,text) from public;
grant execute on function public.food_get_public_storefront_v1(text,text) to anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
