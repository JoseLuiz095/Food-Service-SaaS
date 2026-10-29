import{test,expect,type Page}from'@playwright/test';import AxeBuilder from'@axe-core/playwright';import{mockBackend,store,STORE}from'./fixtures';
const palette={preset:'doce_lua',businessSegment:'confectionery',primaryColor:'#542114',accentColor:'#C97952',highlightColor:'#C98A38',backgroundColor:'#FFF7EF',surfaceColor:'#FFFFFF',textColor:'#32110C',mutedColor:'#7C6259',borderColor:'#EFD9C9',radius:20};
async function setup(page:Page){await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5200'?r.continue():r.abort('blockedbyclient'));await mockBackend(page,{auth:true});let current={...store,visual_theme:{...palette}};let reads=0;const writes:any[]=[];
 await page.route('**/rest/v1/food_stores?*',r=>{reads++;if(r.request().method()==='PATCH'){const b=r.request().postDataJSON();writes.push(b);current={...current,...b};}return r.fulfill({json:[current]})});
 await page.route('**/rest/v1/food_receipt_contacts?*',r=>r.fulfill({json:[]}));await page.route('**/rest/v1/food_pickup_receipt_contacts?*',r=>r.fulfill({json:[]}));await page.route('**/rest/v1/food_pickup_locations?*',r=>r.fulfill({json:[]}));
 return{writes,getReads:()=>reads};}
for(const width of[320,390,768,1366])test(`prévia interativa e paleta da loja em ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});const{writes,getReads}=await setup(page);await page.goto('/admin/configuracoes');const editor=page.getByRole('region',{name:'Uma paleta para sua loja'});
 await expect(page.locator('input[name="visual-theme-preset"]')).toHaveCount(0);await expect(editor.getByText('Cor principal',{exact:true}).first()).toBeVisible();await expect(editor.getByText('Ajustes avançados de todas as cores')).toBeVisible();
 await editor.getByRole('button',{name:'Editar cor de apoio na prévia'}).first().click();const group=editor.getByRole('group',{name:'Editar cor selecionada'});await expect(group.getByLabel('Cor de apoio',{exact:true})).toBeFocused();await group.getByLabel('Código hexadecimal').fill('#123456');
 const before=getReads();await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'foodservice_store_sync_v1',newValue:'synthetic-sync'})));await expect.poll(getReads).toBeGreaterThan(before);await expect(group.getByLabel('Código hexadecimal')).toHaveValue('#123456');
 await editor.getByRole('button',{name:'Editar destaques na prévia'}).click();await expect(group.getByLabel('Destaques',{exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const axe=await new AxeBuilder({page}).include('.appearance-editor').withTags(['wcag2a','wcag2aa']).analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 if(width===390)await editor.screenshot({path:info.outputPath('paleta-interativa.png')});
 await page.getByRole('button',{name:'Salvar configurações',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByText('Configurações salvas.',{exact:true})).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0].visual_theme.accentColor).toBe('#123456');expect(writes[0].visual_theme.preset).toBe('doce_lua');expect(writes[0]).not.toHaveProperty('slug');
 await page.reload();await editor.getByRole('button',{name:'Editar cor de apoio na prévia'}).first().click();await expect(editor.getByRole('group',{name:'Editar cor selecionada'}).getByLabel('Código hexadecimal')).toHaveValue('#123456');
});
test('contatos visíveis com ativação pendente; erro de schema bloqueia gravação',async({page})=>{
 await setup(page);let writes=0;await page.route('**/rest/v1/food_receipt_contacts?*',r=>r.fulfill({status:404,json:{code:'42P01',message:'relation does not exist'}}));await page.route('**/rest/v1/rpc/food_save_receipt_contacts_v1',r=>{writes++;return r.fulfill({json:null})});await page.goto('/admin/configuracoes');const card=page.getByRole('region',{name:'Telefones para confirmação e comprovantes'});await expect(card.getByRole('alert')).toContainText('ativar');await expect(card.getByRole('button',{name:'Salvar contatos de comprovantes'})).toBeDisabled();expect(writes).toBe(0);
});
