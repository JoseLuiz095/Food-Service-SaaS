import {test,expect} from '@playwright/test';
import {mockBackend,snapshot} from './fixtures';

test('Doce Lua mantém identidade própria mesmo com ramo de confeitaria',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const backend=await mockBackend(page);
  await page.route('**/rest/v1/rpc/food_get_public_storefront_v1',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    ...snapshot,store:{...snapshot.store,visual_theme:{preset:'doce_lua',businessSegment:'confectionery',primaryColor:'#542114',accentColor:'#C97952',highlightColor:'#C98A38',backgroundColor:'#FFF7EF',surfaceColor:'#FFFFFF',textColor:'#32110C',mutedColor:'#7C6259',borderColor:'#EFD9C9',radius:20}},
  })}));
  await page.goto('/doce-lua');
  await expect(page.locator('.product-card').first()).toBeVisible();
  const layout=page.locator('.store-layout');
  await expect(layout).toHaveAttribute('data-visual-preset','doce_lua');
  await expect(layout).not.toHaveClass(/storefront-business-theme/);
  expect(await layout.evaluate(node=>getComputedStyle(node).getPropertyValue('--food-store-primary').trim())).toBe('#542114');
  await expect(page.locator('.segment-catalog-intro')).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Buscar no cardápio'})).toBeVisible();
  expect(backend.writes.filter(write=>write.url.endsWith('/food_modules_command'))).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
