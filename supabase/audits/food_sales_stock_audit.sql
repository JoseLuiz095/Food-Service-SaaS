-- Read-only audit. Run against the intended VendeWeb project and export the rows.
-- Do not apply automatic stock corrections from this report.
with item_review as (
  select o.store_id,o.id order_id,o.order_number,o.created_at,o.status,o.payment_status,o.inventory_status,
    i.id order_item_id,i.product_id,i.product_name,i.quantity,i.inventory_reserved_quantity,
    p.track_stock,p.stock_quantity physical,p.stock_reserved_quantity reserved,
    case
      when o.status in ('delivered','picked_up') and p.track_stock
        and (o.inventory_status <> 'committed' or i.inventory_reserved_quantity > 0)
        then 'Entregue sem baixa confirmada pelo estado do pedido'
      when o.status='cancelled' and o.payment_status='paid'
        then 'Cancelado após pagamento: confirmar estorno e destino físico'
    end discrepancy
  from public.food_orders o
  join public.food_order_items i on i.order_id=o.id
  left join public.food_products p on p.id=i.product_id and p.store_id=o.store_id
)
select order_number,product_name,quantity,status,payment_status,inventory_status,
       inventory_reserved_quantity,physical,reserved,discrepancy
from item_review where discrepancy is not null
order by created_at desc,order_number desc,product_name;

-- Reserved global quantity must equal sum of outstanding order item reservations.
select p.store_id,p.id product_id,p.name,p.stock_quantity physical,
       p.stock_reserved_quantity reserved,
       coalesce(sum(i.inventory_reserved_quantity) filter(where o.status<>'cancelled'),0) item_reservations
from public.food_products p
left join public.food_order_items i on i.product_id=p.id
left join public.food_orders o on o.id=i.order_id
where p.track_stock
group by p.store_id,p.id
having p.stock_reserved_quantity is distinct from
       coalesce(sum(i.inventory_reserved_quantity) filter(where o.status<>'cancelled'),0);

-- A paid order with no paid financial entry (or pending order booked as paid) needs review.
select o.store_id,o.order_number,o.status,o.payment_status,o.total,
       f.status financial_status,f.amount
from public.food_orders o
left join public.food_financial_entries f on f.order_id=o.id and f.store_id=o.store_id
where (o.payment_status='paid' and o.status<>'cancelled' and
       (f.id is null or f.status<>'paid' or f.amount<>o.total))
   or (o.payment_status<>'paid' and f.status='paid')
   or (o.status='cancelled' and o.payment_status='paid')
order by o.created_at desc;
