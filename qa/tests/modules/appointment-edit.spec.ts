import { expect, test } from '@playwright/test';
import { mockSegmentPlatform } from './segment-platform-fixtures';

test('editar agendamento preserva o profissional original e não assume sua agenda', async ({ page }) => {
  const { state, initialBusiness } = await mockSegmentPlatform(page, { initial: 'personal' });
  const records = state.stores.get(initialBusiness.id)!.lists;
  const originalProfessional = '90000000-0000-4000-8000-000000000099';
  records.clients.push({ id: 'test-client', store_id: initialBusiness.id, name: 'Aluno fictício', active: true });
  records.services.push({ id: 'test-service', store_id: initialBusiness.id, name: 'Sessão fictícia', kind: 'training', duration_minutes: 60, price_cents: 12000, active: true });
  records.appointments.push({ id: 'test-appointment', store_id: initialBusiness.id, client_id: 'test-client', service_id: 'test-service', professional_id: originalProfessional,
    starts_at: '2027-02-02T13:00:00Z', ends_at: '2027-02-02T14:00:00Z', status: 'scheduled' });
  await page.goto('/admin/operacao?tab=appointments');
  await page.locator('.business-record-list').getByRole('button', { name: 'Editar', exact: true }).click();
  const form = page.locator('#business-record-form');
  await form.getByLabel('Início', { exact: true }).fill('2027-02-03T10:00');
  await form.getByLabel('Término', { exact: true }).fill('2027-02-03T11:00');
  await form.getByRole('button', { name: 'Salvar registro', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('registro salvo no servidor');
  const edit = state.writes.find(write => write.action === 'appointments.save');
  expect(edit?.data.id).toBe('test-appointment');
  expect(edit?.data).not.toHaveProperty('professional_id');
  expect(records.appointments[0].professional_id).toBe(originalProfessional);
  await page.reload();
  await expect(page.locator('.business-record-list')).toContainText('Sessão fictícia');
});
