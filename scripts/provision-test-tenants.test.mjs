import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, chmodSync, readFileSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { TEST_BUSINESSES, FIXTURE_VERSION, validateTarget, provisionTestBusinesses, createEncryptedCredentialSink, decryptCredentialEnvelope, createSupabaseAdapter, main } from './provision-test-tenants.mjs';

const config = { environment: 'staging', projectRef: 'abcdefghijklmnopqrst', appOrigin: 'https://staging.example.invalid', allowProvision: true };
const rejectsCode = async (operation, code) => assert.rejects(operation, error => error.code === code);

function fakeAdapter() {
  const users = new Map(), tenants = new Map(), calls = { creates: [], provisions: [], validations: [] };
  return {
    calls, users, tenants,
    environmentStatus: async () => ({ enabled: true, environment: 'staging', schema_version: 1 }),
    findUser: async email => users.get(email) || null,
    createUser: async body => { calls.creates.push(body); const user = { id: `user-${users.size + 1}`, email: body.email, app_metadata: body.app_metadata }; users.set(body.email, user); return user; },
    provisionBusiness: async body => { calls.provisions.push(body); if (!tenants.has(body.p_slug)) tenants.set(body.p_slug, { store_id: `store-${tenants.size + 1}`, slug: body.p_slug }); return tenants.get(body.p_slug); },
    validateOwner: async body => { calls.validations.push(body); return { login: true, tenant: true, storefront: true, profile: true, modules: true, catalog: true }; },
  };
}

test('default CLI is offline, creates no password and never reads server secrets', async () => {
  const output = [];
  const env = new Proxy({}, { get() { throw new Error('secret must not be read'); } });
  const rows = await main([], env, value => output.push(value));
  assert.equal(rows.length, 7);
  assert.ok(rows.every(row => row.status === 'NOT_CREATED' && row.email.endsWith('@example.invalid') && row.operationsValidated === false));
  assert.ok(!output.join('').includes('initialPassword'));
  let touched = false;
  await provisionTestBusinesses({ ...config, allowProvision: false }, { adapter: fakeAdapter(), saveCredentials() { touched = true; }, passwordFactory() { touched = true; } });
  assert.equal(touched, false);
});

test('target guard blocks production, mismatched refs, embedded credentials and insecure origins', () => {
  assert.equal(validateTarget(config).supabaseUrl, 'https://abcdefghijklmnopqrst.supabase.co');
  for (const projectRef of ['elttryavkeartoxgdgse', 'vnpoinodvchmmbyxpacj']) assert.throws(() => validateTarget({ ...config, projectRef }), error => error.code === 'PRODUCTION_PROJECT_BLOCKED');
  for (const mutation of [
    { environment: 'production' }, { projectRef: '' }, { supabaseUrl: 'https://elttryavkeartoxgdgse.supabase.co' },
    { supabaseUrl: 'https://user:pass@abcdefghijklmnopqrst.supabase.co' }, { supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co/path' },
    { appOrigin: 'https://www.vendeweb.com.br' }, { appOrigin: 'http://staging.example.invalid' },
  ]) assert.throws(() => validateTarget({ ...config, ...mutation }));
});

test('server-disabled environment fails before Auth or credential generation', async () => {
  const adapter = fakeAdapter();
  adapter.environmentStatus = async () => ({ enabled: false, environment: 'disabled', schema_version: 1 });
  let generated = 0;
  await rejectsCode(() => provisionTestBusinesses(config, { adapter, saveCredentials() {}, passwordFactory() { generated++; } }), 'SERVER_TEST_PROVISIONING_DISABLED');
  assert.equal(adapter.calls.creates.length, 0);
  assert.equal(generated, 0);
});

test('seven fixtures create unique credentials privately and rerun without resetting existing Auth', async () => {
  const adapter = fakeAdapter(), snapshots = [];
  const options = { adapter, saveCredentials: data => snapshots.push(structuredClone(data)) };
  const rows = await provisionTestBusinesses(config, options);
  assert.equal(adapter.calls.creates.length, 7);
  assert.equal(new Set(adapter.calls.creates.map(call => call.password)).size, 7);
  assert.ok(adapter.calls.creates.every(call => call.password.length >= 40 && call.email_confirm === true && call.app_metadata.vendeweb_test_fixture === FIXTURE_VERSION));
  assert.ok(rows.every(row => row.status === 'CREATED_BASIC_VALIDATION_PASSED' && row.operationsValidated === false));
  assert.ok(!JSON.stringify(rows).includes('initialPassword'));
  assert.equal(snapshots.at(-1).accounts.length, 7);
  for (const snapshot of snapshots) assert.ok(snapshot.accounts.every(account => typeof account.initialPassword === 'string'));
  assert.deepEqual(adapter.calls.provisions[0].p_extra_modules, ['events', 'rentals']);
  assert.deepEqual(adapter.calls.provisions[1].p_extra_modules, ['clients', 'appointments']);
  assert.ok(adapter.calls.provisions.every(call => call.p_slug.startsWith('test-vendeweb-') && Array.isArray(call.p_catalog)));
  const repeated = await provisionTestBusinesses(config, options);
  assert.equal(adapter.calls.creates.length, 7);
  assert.equal(adapter.calls.validations.length, 7);
  assert.ok(repeated.every(row => row.status === 'EXISTING_PASSWORD_UNCHANGED' && !row.loginValidated));
});

test('existing unrelated Auth is not adopted; partial errors preserve new password without leaking provider errors', async () => {
  const adapter = fakeAdapter(), snapshots = [];
  adapter.users.set(TEST_BUSINESSES[0].email, { id: 'someone-else', app_metadata: {} });
  const providerSecret = randomBytes(24).toString('hex');
  const provision = adapter.provisionBusiness;
  adapter.provisionBusiness = async body => { if (body.p_segment === 'florist') throw new Error(providerSecret); return provision(body); };
  const rows = await provisionTestBusinesses(config, { adapter, saveCredentials: data => snapshots.push(structuredClone(data)) });
  assert.equal(rows[0].errorCode, 'EXISTING_USER_IS_NOT_THIS_FIXTURE');
  assert.equal(rows[1].status, 'FAILED_PARTIAL_NO_AUTOMATIC_DELETE');
  assert.equal(rows[1].errorCode, 'REMOTE_OPERATION_FAILED');
  assert.ok(!JSON.stringify(rows).includes(providerSecret));
  assert.equal(adapter.calls.creates.length, 6);
  assert.ok(snapshots.at(-1).accounts.some(account => account.email === TEST_BUSINESSES[1].email && account.initialPassword && account.status === 'FAILED_PARTIAL_NO_AUTOMATIC_DELETE'));
});

test('credential sink encrypts at 0600, refuses overwrite and any Git checkout', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'vendeweb-private-test-'));
  chmodSync(folder, 0o700);
  try {
    const file = join(folder, 'accounts.enc.json'), passphrase = randomBytes(32).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const save = createEncryptedCredentialSink(file, passphrase);
    save({ accounts: [{ initialPassword: secret }] });
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const raw = readFileSync(file, 'utf8');
    assert.equal(raw.includes(secret), false);
    assert.equal((await decryptCredentialEnvelope(JSON.parse(raw), passphrase)).accounts[0].initialPassword === secret, true);
    await assert.rejects(() => decryptCredentialEnvelope(JSON.parse(raw), randomBytes(32).toString('base64url')));
    assert.throws(() => createEncryptedCredentialSink(file, passphrase), error => error.code === 'CREDENTIAL_FILE_EXISTS_OR_UNWRITABLE');
    mkdirSync(join(folder, '.git'));
    assert.throws(() => createEncryptedCredentialSink(join(folder, 'other.enc.json'), passphrase), error => error.code === 'CREDENTIAL_FILE_MUST_BE_OUTSIDE_GIT');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('SDK adapter uses admin createUser with auto-confirm, no signup or invite endpoint', async () => {
  const calls = [], serviceKey = `sb_secret_${randomBytes(32).toString('base64url')}`;
  const adapter = await createSupabaseAdapter(validateTarget(config), { serviceKey, publishableKey: `sb_publishable_${randomBytes(32).toString('base64url')}`, fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: 'created-user', email: TEST_BUSINESSES[0].email }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  const password = randomBytes(32).toString('base64url');
  const user = await adapter.createUser({ email: TEST_BUSINESSES[0].email, password, email_confirm: true });
  assert.equal(user.id, 'created-user');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/auth/v1/admin/users'));
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(JSON.parse(calls[0].init.body).email_confirm, true);
});
