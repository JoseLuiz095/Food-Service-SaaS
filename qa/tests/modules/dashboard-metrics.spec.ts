import { test, expect } from '@playwright/test';
import { mockBackend } from './fixtures';
for(const width of [320,390,768,1366])test(`RPC ausente é explicada sem erro SQL e retry recupera os totais ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await mockBackend(page,{auth:true});let missing=true;
 await page.route('**/rest/v1/rpc/food_dashboard_metrics_v1',r=>r.fulfill(missing?{status:404,json:{code:'PGRST202',message:'Could not find the function public.food_dashboard_metrics_v1(p_store_id) in the schema cache'}}:{json:{timezone:'America/Sao_Paulo',asOf:new Date().toISOString(),ordersTotal:150,cancelledOrders:0,ordersToday:5,pendingPayments:12,pendingAmount:150,processingOrders:3,scheduledToday:2,paidOrders:20,totalReceived:200,receivedToday:100,receivedTodayCount:10,receiptsToReview:2,receiptsToReviewAmount:35}}));
 await page.goto('/admin');const alert=page.getByRole('alert').filter({hasText:'Indicadores indisponíveis'});
 await expect(alert).toContainText('Os indicadores ainda não foram ativados');
 await expect(page.getByText(/Could not find|food_dashboard_metrics_v1|schema cache/)).toHaveCount(0);
 const card=page.locator('.dashboard-today-metric').filter({hasText:'Recebido hoje'});await expect(card).toContainText('—');
 missing=false;await alert.getByRole('button',{name:'Tentar novamente'}).click();await expect(alert).toHaveCount(0);
 await expect(card).toContainText('100,00');await expect(page.locator('.dashboard-today-metric').filter({hasText:'Comprovantes a conferir'})).toContainText('35,00');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
