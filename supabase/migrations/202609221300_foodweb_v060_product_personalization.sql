-- FoodWeb v0.6.0
-- Visual alternativo por emoji para produtos sem imagem.
-- Grupos de opções/adicionais já existem; esta migration apenas persiste o emoji.

alter table public.food_products
  add column if not exists visual_emoji text;

comment on column public.food_products.visual_emoji is
  'Emoji opcional usado na vitrine quando o produto não possui imagem cadastrada.';

-- Evita payloads excessivos sem impor uma lista fechada de emojis.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_products_visual_emoji_length_chk'
      and conrelid = 'public.food_products'::regclass
  ) then
    alter table public.food_products
      add constraint food_products_visual_emoji_length_chk
      check (visual_emoji is null or char_length(visual_emoji) between 1 and 32);
  end if;
end $$;
