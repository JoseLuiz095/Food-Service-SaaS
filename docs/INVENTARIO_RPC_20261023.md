# Inventário estático de RPCs — VendeWeb

Data: 23/10/2026. Fonte: src e supabase/functions. Inclui chamadas `rpc/nome`, chamadas `.rpc()` e wrapper `rpc<T>()` com nomes literais. Não executa chamadas nem comprova histórico/grants/assinaturas/schema remoto. Rotas construídas dinamicamente continuam exigindo inspeção própria. “Definição local” significa ao menos um CREATE localizado, não prova a ordem efetiva de DROP/overloads em cada ambiente.

| RPC chamada | Origem | Última migration com definição localizada |
|---|---|---|
| `food_adjust_inventory` | `src/services/inventoryApi.ts` | `202610091500_foodweb_inventory_foundation.sql` |
| `food_adjust_product_stock_v1` | `src/services/storeApi.ts` | `20261023101500_food_product_stock_adjustments.sql` |
| `food_business_initialize` | `src/platform/api.ts`, `src/services/businessPresentation.ts` | `20261022215432_food_business_segments.sql` |
| `food_business_master` | `src/platform/api.ts`, `src/services/businessPresentation.ts` | `20261022215432_food_business_segments.sql` |
| `food_business_operate` | `src/platform/api.ts` | `20261022215432_food_business_segments.sql` |
| `food_business_public` | `src/platform/PublicBusinessOffers.tsx` | `20261022215432_food_business_segments.sql` |
| `food_business_status` | `src/platform/api.ts`, `src/services/businessPresentation.ts` | `20261022215432_food_business_segments.sql` |
| `food_commit_inventory_count` | `src/services/inventoryApi.ts` | `20261022175933_food_operational_rpc_repair.sql` |
| `food_complete_self_service_signup_for_user_v1` | `supabase/functions/food-public-self-signup/index.ts` | `202609291100_foodweb_public_self_signup_rate_limit.sql` |
| `food_complete_self_service_signup_v2` | `src/services/selfServiceSignup.ts` | `202609180810_foodweb_v056_trial_eligibility_hardening.sql` |
| `food_confirm_order_payment_v1` | `src/services/storeApi.ts` | `202610091200_foodweb_manual_ondemand_inventory.sql` |
| `food_confirm_subscription_payment` | `src/services/platformApi.ts` | `202609151040_foodweb_v050_stability_billing_audit.sql` |
| `food_convert_inventory_unit` | `src/services/inventoryApi.ts` | `20261022175933_food_operational_rpc_repair.sql` |
| `food_create_admin_order_v1` | `src/services/storeApi.ts` | `202610091200_foodweb_manual_ondemand_inventory.sql` |
| `food_create_manual_subscription_payment` | `src/services/billingApi.ts` | `202609032230_foodweb_v046_billing_access.sql` |
| `food_create_public_order` | `supabase/functions/food-public-checkout/index.ts` | `202610201900_foodweb_party_custom_weight.sql` |
| `food_enforce_public_contact_rate_limit` | `supabase/functions/food-public-contact/index.ts` | `202609031500_foodweb_v044_security_contact.sql` |
| `food_enforce_public_self_signup_rate_limit` | `supabase/functions/food-public-self-signup/index.ts` | `202609291100_foodweb_public_self_signup_rate_limit.sql` |
| `food_get_admin_support_contact_v1` | `src/services/supportApi.ts` | `202609031500_foodweb_v044_security_contact.sql` |
| `food_get_billing_settings_for_store` | `src/services/billingApi.ts` | `202609020800_foodweb_v040_manual_pix_finance_visual.sql` |
| `food_get_public_landing_v1` | `src/services/landingApi.ts` | `202609231000_foodweb_v062_plan_marketing_benefits.sql` |
| `food_get_public_storefront_v1` | `src/services/storeApi.ts` | `20261022144600_food_public_store_projection.sql` |
| `food_get_store_analytics_v1` | `src/services/analyticsApi.ts` | `202608310900_foodservice_commercial_finance_v030.sql` |
| `food_get_store_billing_overview_v1` | `src/services/billingApi.ts` | `202609032230_foodweb_v046_billing_access.sql` |
| `food_list_low_stock_inventory` | `src/services/inventoryApi.ts` | `202610131200_foodweb_inventory_recipe_consumption.sql` |
| `food_log_platform_event_v1` | `src/services/interactionTelemetry.ts` | `202609171230_foodweb_v054_event_log_repair.sql` |
| `food_mark_public_order_whatsapp_clicked` | `src/services/storeApi.ts` | `202608280400_foodservice_shared_database.sql` |
| `food_mark_subscription_proof_sent` | `src/services/billingApi.ts` | `202608310900_foodservice_commercial_finance_v030.sql` |
| `food_modules_catalog` | `src/modules/api.ts` | `20261021143724_foodweb_optional_modules_transactions.sql` |
| `food_modules_cleanup` | `supabase/functions/food-modules-public/index.ts` | `20261021143724_foodweb_optional_modules_transactions.sql` |
| `food_modules_command` | `src/modules/api.ts` | `20261021143724_foodweb_optional_modules_transactions.sql` |
| `food_modules_customer` | `supabase/functions/food-modules-public/index.ts` | `20261021143724_foodweb_optional_modules_transactions.sql` |
| `food_modules_directory` | `src/modules/api.ts` | `20261021143724_foodweb_optional_modules_transactions.sql` |
| `food_modules_rate_limit` | `supabase/functions/food-modules-public/index.ts` | `20261021143724_foodweb_optional_modules_transactions.sql` |
| `food_platform_approve_self_service_signup_v2` | `src/services/selfServiceSignup.ts` | `202609180810_foodweb_v056_trial_eligibility_hardening.sql` |
| `food_platform_get_billing_dashboard_v1` | `src/services/platformApi.ts` | `202609032230_foodweb_v046_billing_access.sql` |
| `food_platform_list_event_log_v1` | `src/services/platformApi.ts` | `202609171230_foodweb_v054_event_log_repair.sql` |
| `food_platform_list_self_service_signups_v2` | `src/services/selfServiceSignup.ts` | `202609180810_foodweb_v056_trial_eligibility_hardening.sql` |
| `food_platform_reject_self_service_signup_v1` | `src/services/selfServiceSignup.ts` | `202609171935_foodweb_v056_self_service_signup.sql` |
| `food_platform_reject_subscription_payment_v1` | `src/services/platformApi.ts` | `202609151040_foodweb_v050_stability_billing_audit.sql` |
| `food_platform_seed_new_store` | `supabase/functions/food-platform-create-store/index.ts` | `202608280400_foodservice_shared_database.sql` |
| `food_platform_system_check` | `src/services/platformApi.ts` | `202609020800_foodweb_v040_manual_pix_finance_visual.sql` |
| `food_record_inventory_purchase` | `src/services/inventoryApi.ts` | `202610091500_foodweb_inventory_foundation.sql` |
| `food_resolve_storefront_status` | `src/services/storeApi.ts` | `202608280400_foodservice_shared_database.sql` |
| `food_track_public_event_v1` | `src/services/analyticsApi.ts` | `202608280400_foodservice_shared_database.sql` |
| `food_update_order_items_v1` | `src/services/storeApi.ts` | `20261022175933_food_operational_rpc_repair.sql` |

Total: **46** nomes literais; **0** sem definição local. Estado remoto: bloqueado por falta de permissão no projeto `elttryavkeartoxgdgse`. Nenhuma dessas RPCs foi certificada em Supabase remoto nesta rodada.
