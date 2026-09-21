begin;
update public.food_plans
set monthly_price = case code
  when 'ESSENTIAL' then 49.90
  when 'STARTER' then 89.90
  when 'PROFESSIONAL' then 149.90
  else monthly_price
end,
updated_at=now()
where code in ('ESSENTIAL','STARTER','PROFESSIONAL');
update public.food_platform_settings set demo_duration_days=30,updated_at=now() where id=1;
commit;
