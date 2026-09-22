-- FoodWeb v0.6.1 - validacao simples
select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='food_stores'
  and column_name='kds_enabled';
