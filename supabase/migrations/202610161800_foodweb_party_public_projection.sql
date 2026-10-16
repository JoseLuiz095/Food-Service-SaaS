-- Expõe apenas os metadados operacionais seguros de encomendas de festa
-- na vitrine pública. A migration anterior endurece a projeção, mas foi
-- criada antes das colunas party_*; este wrapper mantém a whitelist e evita
-- duplicar toda a função pública.
begin;

alter function public.food_get_public_storefront_v1(text, text)
  rename to food_get_public_storefront_v1_base;

create or replace function public.food_get_public_storefront_v1(p_slug text default null, p_hostname text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_payload jsonb;
  v_products jsonb;
begin
  v_payload := public.food_get_public_storefront_v1_base(p_slug, p_hostname);

  if coalesce(v_payload->>'found', 'false') <> 'true'
     or coalesce(v_payload->>'status', '') <> 'online' then
    return v_payload;
  end if;

  select coalesce(jsonb_agg(
    product || jsonb_build_object(
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
  ), '[]'::jsonb)
    into v_products
    from jsonb_array_elements(coalesce(v_payload->'products', '[]'::jsonb)) as entries(product)
    join public.food_products p on p.id::text = entries.product->>'id';

  return jsonb_set(v_payload, '{products}', v_products, true);
end;
$$;

revoke all on function public.food_get_public_storefront_v1(text, text) from public;
grant execute on function public.food_get_public_storefront_v1(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
