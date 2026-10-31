import {test,expect} from '@playwright/test';
import {mockBackend,STORE} from './fixtures';

const point='30000000-0000-4000-8000-000000000001';
const location='40000000-0000-4000-8000-000000000001';

for(const width of [320,390,1366])test(`WhatsApp único do ponto persiste e falha mantém rascunho ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5193'?r.continue():r.abort('blockedbyclient'));
 await mockBackend(page,{auth:true});
 await page.route('**/rpc/food_stock_mode_v1',r=>r.fulfill({json:{multi_location_enabled:true}}));
 await page.route('**/food_stock_locations?**',r=>r.fulfill({json:[{id:location,store_id:STORE,name:'Local fictício',active:true,is_default:true,location_type:'warehouse'}]}));
 await page.route('**/food_pickup_locations?**',r=>r.fulfill({json:[{id:point,store_id:STORE,stock_location_id:location,name:'Ponto fictício',short_code:'TEST-01',active:true,is_public:true}]}));
 let stored:unknown[]=[],fail=true;const writes:unknown[]=[];
 await page.route('**/food_pickup_point_contacts?**',r=>r.fulfill({json:stored}));
 await page.route('**/rpc/food_save_pickup_point_contacts_v1',r=>{
  const body=r.request().postDataJSON();writes.push(body);
  if(fail){fail=false;return r.fulfill({status:503,json:{message:'Falha sintética'}})}
  stored=body.p_contacts;return r.fulfill({json:null});
 });
 const open=async()=>{
  await page.goto('/admin/estoque?visao=locais');
  await page.getByText('Gerenciar locais e pontos de retirada',{exact:true}).click();
  await page.getByText('Gerenciar contatos deste ponto',{exact:true}).click();
 };
 await open();const editor=page.locator('.point-contacts-editor');
 await editor.getByLabel('Nome para identificação').fill('Pessoa fictícia');
 await editor.getByLabel('WhatsApp com código do país').fill('+55 (11) 00000-0001');
 await expect(editor.getByRole('textbox')).toHaveCount(2);
 await editor.getByRole('button',{name:'Salvar WhatsApp do ponto'}).click();
 await expect(editor.getByRole('alert')).toContainText('preenchimento foi mantido');
 await expect(editor.getByLabel('Nome para identificação')).toHaveValue('Pessoa fictícia');
 await editor.getByRole('button',{name:'Salvar WhatsApp do ponto'}).click();
 await expect(editor.getByRole('status')).toHaveText('WhatsApp para comprovantes salvo.');
 expect(writes).toEqual(Array(2).fill({p_store_id:STORE,p_point_id:point,p_contacts:[{slot:1,name:'Pessoa fictícia',phone:'5511000000001',purpose:'proof'}]}));
 await open();await expect(editor.getByLabel('Nome para identificação')).toHaveValue('Pessoa fictícia');
 await expect(editor.getByLabel('WhatsApp com código do país')).toHaveValue('5511000000001');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
