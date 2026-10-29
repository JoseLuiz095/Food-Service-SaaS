import {test,expect} from '@playwright/test';
import {mockBackend} from './fixtures';
for(const width of [320,390,1366])test(`conteúdo público permanece visível com API lenta em ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});const external:string[]=[];
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='http://127.0.0.1:5196'||u.protocol==='data:')return r.continue();external.push(u.origin);return r.abort('blockedbyclient')});
 await mockBackend(page);
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/rest/v1/rpc/food_get_public_landing_v1',async r=>{await gate;await r.fulfill({json:{stores:[],plans:[],demo_enabled:true,demo_duration_days:21,demo_store_slug:'loja-sintetica'}})});
 await page.goto('/');await expect(page.getByRole('heading',{level:1})).toHaveText('Sua vitrine online.Seu jeito de vender.');await expect(page.getByRole('status').filter({hasText:'Consultando planos'})).toBeVisible();await expect(page.getByRole('heading',{name:'Venda online com uma operação organizada'})).toBeVisible();
 await expect(page.locator('.sales-plan-price')).toHaveCount(0);await expect(page.getByText('21 dias para experimentar',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(width===390)await page.screenshot({path:info.outputPath('landing-api-lenta.png'),fullPage:true});
 release();await expect(page.getByText('21 dias para experimentar',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{level:1})).toHaveCount(1);expect(external).toEqual([]);
});
