-- Validacao FoodWeb v0.6.3
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='food_stores' and column_name in ('sales_recovery_window_hours','crm_come_back_days','repeat_order_max_age_days','customer_message_templates') order by column_name;
