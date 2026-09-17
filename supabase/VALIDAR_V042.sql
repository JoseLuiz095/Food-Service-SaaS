-- FoodWeb v0.4.2 - validacao da landing publica
select to_regprocedure('public.food_get_public_landing_v1()') as landing_rpc;
select public.food_get_public_landing_v1() -> 'plans' as planos_publicos;
select public.food_get_public_landing_v1() -> 'stores' as lojas_publicas;
