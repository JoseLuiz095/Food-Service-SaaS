import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/services/financeApi.ts', 'utf8')
  .replace(/^import .* from .*;\n/gm, '')
  .replace('export const financeApi=', 'const financeApi=');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/export \{\};?\s*$/, '');
const requests = [];
const rows = Array.from({ length: 305 }, (_, index) => ({
  id: String(index), store_id: 'loja-a', direction: index % 2 ? 'expense' : 'income',
  source: 'manual', order_id: null, inventory_purchase_id: index === 0 ? 'compra-a' : null,
  category_id: null, description: 'Lançamento', amount: '12.50', occurred_on: '2026-10-28',
  due_on: null, paid_at: null, status: 'paid', payment_method: null, counterparty: null,
  document_type: 'none', document_number: null, notes: null, created_at: '2026-10-28T12:00:00Z',
}));
const restFetch = async (path) => {
  requests.push(path);
  assert.match(path, /inventory_purchase_id/);
  assert.doesNotMatch(path, /(?:^|,)purchase_id(?:,|&)/);
  assert.match(path, /store_id=eq\.loja-a/);
  const limit = Number(new URLSearchParams(path.split('?')[1]).get('limit'));
  const offset = Number(new URLSearchParams(path.split('?')[1]).get('offset'));
  return rows.slice(offset, offset + limit);
};
const financeApi = new Function('restFetch', 'isDemoMode', 'createId', `${compiled}; return financeApi;`)(restFetch, false, () => 'novo-id');
const first = await financeApi.listEntriesPage('loja-a', { limit: 100 });
assert.equal(first.hasMore, true);
assert.equal(first.entries[0].purchaseId, 'compra-a');
const complete = await financeApi.listAllEntries('loja-a', first);
assert.equal(complete.length, 305);
assert.equal(complete.reduce((sum, entry) => sum + entry.amount, 0), 3812.5);
assert.equal(requests.length, 2);
assert.match(requests[1], /offset=100/);
console.log('OK: contrato financeiro, vínculo de compra e paginação completa dos lançamentos.');
