-- FoodWeb v0.6.1 - ferramentas simples de crescimento
-- Mantem CRM/recuperacao derivados dos pedidos existentes e adiciona apenas
-- uma preferencia opcional da loja para exibir o modo cozinha/KDS.

alter table public.food_stores
  add column if not exists kds_enabled boolean not null default false;

comment on column public.food_stores.kds_enabled is
  'Quando true, exibe o quadro de cozinha/KDS integrado a tela de pedidos do FoodWeb.';
