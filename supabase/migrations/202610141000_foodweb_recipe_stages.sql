-- Permite registrar o mesmo insumo em fases diferentes da ficha técnica.
-- Ex.: Ninho Italac na Base e Ninho na Finalização.
begin;

alter table public.food_product_recipe_items
  add column if not exists stage text not null default 'Geral';

update public.food_product_recipe_items
   set stage = 'Geral'
 where stage is null or btrim(stage) = '';

alter table public.food_product_recipe_items
  drop constraint if exists food_product_recipe_items_recipe_id_inventory_item_id_key;

alter table public.food_product_recipe_items
  add constraint food_product_recipe_items_stage_not_blank
  check (btrim(stage) <> '');

create index if not exists food_product_recipe_items_recipe_stage_idx
  on public.food_product_recipe_items(store_id, recipe_id, stage, sort_order);

comment on column public.food_product_recipe_items.stage is
  'Etapa da receita, como Base ou Finalização; permite o mesmo insumo em fases distintas.';

commit;
