import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mockBackend} from './fixtures';

async function setup(page: import('@playwright/test').Page) {
  await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5197'?r.continue():r.abort('blockedbyclient'));
  await mockBackend(page);
  await page.addInitScript(()=>{
    const callbacks:Record<string,any>={};
    (window as any).qaCaptcha=callbacks;
    window.turnstile={render:(_element,options)=>{Object.assign(callbacks,options);return 'synthetic-widget';},reset:()=>{callbacks.callback?.('');},remove:()=>{}};
  });
}

for(const width of [320,390,1366])test(`recuperação exige CAPTCHA e envia token em ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await setup(page);
  let body:any;let calls=0;
  await page.route('**/auth/v1/recover?*',r=>{calls++;body=r.request().postDataJSON();return r.fulfill({json:{}})});
  await page.goto('/admin/esqueci-senha');
  await page.getByLabel('E-mail',{exact:true}).fill('conta.sintetica@example.invalid');
  const send=page.getByRole('button',{name:'Enviar link de recuperação'});
  await expect(send).toBeDisabled();expect(calls).toBe(0);
  const formA11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  expect(formA11y.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
  await page.evaluate(()=>(window as any).qaCaptcha.callback('synthetic-token'));
  await expect(send).toBeEnabled();
  await page.evaluate(()=>(window as any).qaCaptcha['expired-callback']());
  await expect(send).toBeDisabled();
  await page.evaluate(()=>(window as any).qaCaptcha.callback('synthetic-fresh-token'));
  await page.getByLabel('E-mail',{exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Confira seu e-mail'})).toBeVisible();
  expect(calls).toBe(1);expect(body.gotrue_meta_security.captcha_token).toBe('synthetic-fresh-token');
  expect(body.email).toBe('conta.sintetica@example.invalid');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  expect(a11y.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
  if(width===390)await page.screenshot({path:info.outputPath('recuperacao-enviada.png'),fullPage:true});
});

test('falha do CAPTCHA exige verificação nova e link expirado não altera senha',async({page})=>{
  await setup(page);let calls=0;
  await page.route('**/auth/v1/recover?*',r=>{calls++;return r.fulfill({status:400,json:{code:'captcha_failed',msg:'captcha protection: request disallowed'}})});
  await page.goto('/admin/esqueci-senha');await page.getByLabel('E-mail',{exact:true}).fill('conta.sintetica@example.invalid');
  await page.evaluate(()=>(window as any).qaCaptcha.callback('synthetic-token'));
  await page.getByRole('button',{name:'Enviar link de recuperação'}).click();
  await expect(page.getByRole('alert')).toContainText('verificação de segurança');
  await expect(page.getByRole('button',{name:'Enviar link de recuperação'})).toBeDisabled();
  expect(calls).toBe(1);
  await page.goto('/admin/redefinir-senha');
  await expect(page.getByRole('heading',{name:'Não foi possível validar o acesso'})).toBeVisible();
  await expect(page.getByLabel('Nova senha',{exact:true})).toHaveCount(0);
});
