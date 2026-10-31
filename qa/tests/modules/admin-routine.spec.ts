import {test,expect} from '@playwright/test';
import {mockBackend,STORE} from './fixtures';
for(const segment of ['food','confectionery','florist','retail','services','rentals','printing3d','personal','fitness','nutrition','creator'])test(`rotina operacional usa cadastro e módulos: ${segment}`,async({page})=>{
 await mockBackend(page,{auth:true});await page.setViewportSize({width:390,height:850});
 const codes=segment==='creator'?['creator']:['personal','fitness','nutrition','services'].includes(segment)?['clients','appointments']:[];
 await page.route('**/rpc/food_business_status',r=>r.fulfill({json:{profile:{store_id:STORE,primary_segment:segment},legacy:false,can_initialize:false,modules:codes.map(code=>({code,effective:true}))}}));
 await page.goto('/admin');const hub=page.getByRole('region',{name:'Rotinas e ferramentas'});
 const expand=hub.getByRole('button',{name:/Ver todas as ferramentas/});if(await expand.count())await expand.click();
 await expect(hub.getByRole('link',{name:/Conferir pagamentos/})).toHaveAttribute('href','/admin/pedidos?queue=payment');
 if(codes.includes('appointments'))await expect(hub.getByRole('link',{name:'Agenda Organizar atendimentos'})).toHaveAttribute('href',segment==='fitness'?'/admin/fitness':'/admin/operacao?tab=appointments');
 else await expect(hub.getByRole('link',{name:'Agenda Organizar atendimentos'})).toHaveCount(0);
 if(segment==='fitness')await expect(hub.getByRole('link',{name:/Alunos Cadastro/})).toBeVisible();
 await hub.getByLabel('Buscar ferramenta').fill('preco');await expect(hub.getByRole('link')).toHaveCount(1);await expect(hub.getByRole('link')).toContainText('Preços');
 await hub.getByLabel('Buscar ferramenta').fill('inexistente');await expect(hub.getByRole('status')).toContainText('Nenhuma ferramenta');await hub.getByRole('button',{name:'Limpar busca'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
