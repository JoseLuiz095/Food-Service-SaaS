-- psql -v store_id='<confirmed UUID>' -f scripts/audit-order-stock-readonly.sql
-- Run with a read-only database connection. Never use a browser/service key here.
-- Single consistent snapshot; no RPC calls, balance changes or retrospective logs.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH tenant AS (SELECT :'store_id'::uuid AS id)
SELECT jsonb_build_object(
  'captured_at', now(),
  'store', (SELECT jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug)
            FROM public.food_stores s JOIN tenant t ON s.id=t.id),
  'pickup_points', (SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,
      'stock_location_id',p.stock_location_id,'active',p.active,'is_public',p.is_public))
      FROM public.food_pickup_locations p JOIN tenant t ON p.store_id=t.id),
  'locations', (SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,
      'active',l.active,'is_default',l.is_default))
      FROM public.food_stock_locations l JOIN tenant t ON l.store_id=t.id),
  'orders', (SELECT jsonb_agg(jsonb_build_object('id',o.id,'order_number',o.order_number,
      'store_id',o.store_id,'source',o.source,'status',o.status,'payment_status',o.payment_status,
      'inventory_status',o.inventory_status,'pickup_location_id',o.pickup_location_id,
      'stock_location_id',o.stock_location_id,'created_at',o.created_at,'updated_at',o.updated_at))
      FROM public.food_orders o JOIN tenant t ON o.store_id=t.id),
  'items', (SELECT jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,
      'product_id',i.product_id,'product_name',i.product_name,'variant_name',i.variant_name,
      'quantity',i.quantity,'inventory_reserved_quantity',i.inventory_reserved_quantity))
      FROM public.food_order_items i JOIN public.food_orders o ON o.id=i.order_id
      JOIN tenant t ON o.store_id=t.id),
  'products', (SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,
      'stock_quantity',p.stock_quantity,'stock_reserved_quantity',p.stock_reserved_quantity,
      'track_stock',p.track_stock)) FROM public.food_products p JOIN tenant t ON p.store_id=t.id),
  'balances', (SELECT jsonb_agg(to_jsonb(b)) FROM public.food_product_location_stock b
      JOIN tenant t ON b.store_id=t.id),
  'order_movements', (SELECT jsonb_agg(to_jsonb(m)) FROM public.food_order_stock_movements m
      JOIN tenant t ON m.store_id=t.id),
  'location_movements', (SELECT jsonb_agg(to_jsonb(m)-'created_by') FROM public.food_stock_location_movements m
      JOIN tenant t ON m.store_id=t.id),
  'product_movements', (SELECT jsonb_agg(to_jsonb(m)-'created_by') FROM public.food_product_stock_movements m
      JOIN tenant t ON m.store_id=t.id)
) AS snapshot;
COMMIT;
