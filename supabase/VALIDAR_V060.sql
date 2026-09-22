-- FoodWeb v0.6.0 - validação de estrutura
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema='public'
  and table_name='food_products'
  and column_name='visual_emoji';

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.food_products'::regclass
  and conname='food_products_visual_emoji_length_chk';
