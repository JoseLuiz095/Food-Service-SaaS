-- Avalia a identidade uma vez por consulta nas políticas que crescem junto
-- com pedidos, estoque e dispositivos conectados, sem mudar a autorização.
alter policy food_inventory_movements_admin_insert on public.food_inventory_movements
  with check (food_is_store_admin(store_id) and created_by = (select auth.uid()));

alter policy food_inventory_purchases_admin_all on public.food_inventory_purchases
  with check (food_is_store_admin(store_id) and created_by = (select auth.uid()));

alter policy food_platform_admins_self_select on public.food_platform_admins
  using (user_id = (select auth.uid()));

alter policy food_push_subscriptions_insert_admin on public.food_push_subscriptions
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.food_store_users su
      where su.store_id = food_push_subscriptions.store_id
        and su.user_id = (select auth.uid())
        and su.active = true
        and su.role = any (array['owner', 'admin'])
    )
  );

alter policy food_push_subscriptions_select_admin on public.food_push_subscriptions
  using (
    exists (
      select 1
      from public.food_store_users su
      where su.store_id = food_push_subscriptions.store_id
        and su.user_id = (select auth.uid())
        and su.active = true
        and su.role = any (array['owner', 'admin'])
    )
  );

alter policy food_push_subscriptions_update_admin on public.food_push_subscriptions
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.food_store_users su
      where su.store_id = food_push_subscriptions.store_id
        and su.user_id = (select auth.uid())
        and su.active = true
        and su.role = any (array['owner', 'admin'])
    )
  )
  with check (user_id = (select auth.uid()));

alter policy food_self_signup_owner_read on public.food_self_service_signup_requests
  using (user_id = (select auth.uid()) or food_is_platform_admin());

alter policy food_store_users_self_select on public.food_store_users
  using (user_id = (select auth.uid()) or food_is_store_admin(store_id) or food_is_platform_admin());
