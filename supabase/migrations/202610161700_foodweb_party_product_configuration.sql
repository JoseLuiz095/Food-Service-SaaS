-- Configuração operacional opcional para produtos sob encomenda de festas.
--
-- Os campos são aditivos e permanecem desativados por padrão para preservar
-- produtos e lojas já existentes. A vitrine pública não deve incluir estes
-- metadados em sua projeção; eles são usados apenas pelo painel e pelo fluxo
-- de cálculo/validação de encomendas.

begin;

alter table public.food_products
  add column if not exists party_order_enabled boolean not null default false,
  add column if not exists party_price_per_gram numeric(12,4),
  add column if not exists party_package_weight_grams numeric(12,3),
  add column if not exists party_minimum_packages integer not null default 1,
  add column if not exists party_lead_time_days integer not null default 0,
  add column if not exists party_artwork_instructions text,
  add column if not exists party_artwork_url text,
  add column if not exists default_order_status text not null default 'received';

-- Constraints nomeadas e idempotentes: a migration pode ser reaplicada em
-- ambientes de homologação sem falhar por constraint já existente.
alter table public.food_products
  drop constraint if exists food_products_party_price_per_gram_ck,
  drop constraint if exists food_products_party_package_weight_ck,
  drop constraint if exists food_products_party_minimum_packages_ck,
  drop constraint if exists food_products_party_lead_time_days_ck,
  drop constraint if exists food_products_default_order_status_ck;

alter table public.food_products
  add constraint food_products_party_price_per_gram_ck
    check (party_price_per_gram is null or party_price_per_gram >= 0),
  add constraint food_products_party_package_weight_ck
    check (party_package_weight_grams is null or party_package_weight_grams > 0),
  add constraint food_products_party_minimum_packages_ck
    check (party_minimum_packages > 0),
  add constraint food_products_party_lead_time_days_ck
    check (party_lead_time_days >= 0),
  add constraint food_products_default_order_status_ck
    check (default_order_status in ('received','confirmed','preparing','ready','out_for_delivery','delivered','picked_up'));

create index if not exists food_products_store_party_orders_idx
  on public.food_products(store_id, party_order_enabled, active, sort_order)
  where party_order_enabled;

comment on column public.food_products.party_order_enabled is
  'Indica que o produto pode ser vendido sob encomenda para festas.';
comment on column public.food_products.party_price_per_gram is
  'Preço de referência por grama para encomendas de festa.';
comment on column public.food_products.party_package_weight_grams is
  'Peso padrão, em gramas, de cada pacote da encomenda.';
comment on column public.food_products.party_minimum_packages is
  'Quantidade mínima de pacotes para uma encomenda de festa.';
comment on column public.food_products.party_lead_time_days is
  'Antecedência mínima, em dias, para uma encomenda de festa.';
comment on column public.food_products.party_artwork_instructions is
  'Orientação ou referência da arte que o cliente deve enviar à loja.';
comment on column public.food_products.party_artwork_url is
  'URL opcional de uma arte/referência aprovada para o produto.';
comment on column public.food_products.default_order_status is
  'Status operacional inicial sugerido quando o produto é lançado manualmente.';

notify pgrst, 'reload schema';
commit;
