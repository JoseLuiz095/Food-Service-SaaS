import { test, expect } from '@playwright/test';
import { mockBackend } from './fixtures';

for (const width of [320,390,768,1366]) test(`Admin catalog and order filters at ${width}px`,async ({page})=>{
  await page.setViewportSize({width,height:900});
  await mockBackend(page,{auth:true});
  await page.goto('/admin/produtos');
  await expect(page.getByRole('heading',{name:'Catálogo',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Novo produto'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Novo serviço ou consulta'})).toHaveCount(0);
  if(width<=820)await page.getByRole('button',{name:'Abrir menu'}).click();
  const nav=page.getByRole('navigation',{name:'Navegação do negócio'});
  await expect(nav.getByRole('link',{name:'Catálogo',exact:true})).toBeVisible();
  await expect(nav.getByRole('link',{name:'Análises'})).toBeVisible();
  await expect(nav.locator('.admin-nav__subitems')).toHaveCount(0);
  await page.goto('/admin/pedidos');
  const queues=page.getByRole('navigation',{name:'Filtros de pedidos'});
  await queues.getByRole('button',{name:/Conferir pagamentos/}).click();
  await expect(page).toHaveURL(/queue=payment/);
  await expect(page.getByRole('heading',{name:'Recebimentos a conferir'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Recebidos · hoje e em andamento'})).toHaveCount(0);
  await queues.getByRole('button',{name:/Entregas pendentes/}).click();
  await expect(page.getByRole('heading',{name:'Recebidos · hoje e em andamento'})).toBeVisible();
  await queues.getByRole('button',{name:/Agendados/}).click();
  await expect(page.locator('#orders-scheduled')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
