-- FoodWeb v0.4.4 - validacao da seguranca de contato e suporte interno
select to_regclass('public.food_public_contact_rate_limits') as contact_rate_limit_table;

select p.proname
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'food_get_public_landing_v1',
    'food_get_admin_support_contact_v1',
    'food_enforce_public_contact_rate_limit'
  )
order by p.proname;

-- A landing publica deve ter contact_protected=true e nao deve expor telefones da plataforma.
select public.food_get_public_landing_v1() as public_landing;

select
  public.food_get_public_landing_v1() ? 'contact_protected' as has_contact_protected,
  public.food_get_public_landing_v1() ? 'marketing_whatsapp' as exposes_marketing_whatsapp,
  public.food_get_public_landing_v1() ? 'support_whatsapp' as exposes_support_whatsapp,
  public.food_get_public_landing_v1() ? 'billing_whatsapp' as exposes_billing_whatsapp,
  public.food_get_public_landing_v1() ? 'billing_pix_key' as exposes_pix_key;
