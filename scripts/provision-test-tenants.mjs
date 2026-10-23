import { randomBytes, createCipheriv, scryptSync } from 'node:crypto';
import { existsSync, realpathSync, statSync, openSync, closeSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// shared_future: non-production fixtures; no passwords, tokens or production IDs are written to Git.
export const FIXTURE_VERSION = 'vendeweb-test-v1';
export const BLOCKED_PROJECTS = new Set(['elttryavkeartoxgdgse', 'vnpoinodvchmmbyxpacj']);
const blockedOrigins = new Set(['vendeweb.com.br', 'www.vendeweb.com.br', 'academia.joseluizacama.workers.dev']);
const definitions = [
  ['food', 'Sabor da Vila', 'sabor-da-vila', ['events', 'rentals'], [['Prato da casa', 'Cardápio', 24.9], ['Suco da vila', 'Bebidas', 8]]],
  ['florist', 'Jardim Encantado', 'jardim-encantado', ['clients', 'appointments'], [['Buquê Jardim', 'Buquês', 89], ['Arranjo de mesa', 'Arranjos', 59]]],
  ['retail', 'Loja Horizonte', 'loja-horizonte', [], [['Bolsa Horizonte', 'Acessórios', 79], ['Caderno de ideias', 'Papelaria', 24]]],
  ['rentals', 'Festa Nuvem', 'festa-nuvem', ['events', 'rentals'], [['Locação de brinquedo', 'Locações', 180], ['Montagem do evento', 'Serviços', 60]]],
  ['personal', 'Movimento Ativo', 'movimento-ativo', [], [['Consultoria inicial', 'Consultorias', 100], ['Faixa elástica', 'Produtos físicos', 35]]],
  ['nutrition', 'Equilíbrio Nutri', 'equilibrio-nutri', [], [['Consulta inicial', 'Consultas', 150], ['Pacote de retornos', 'Acompanhamento', 280]]],
  ['creator', 'Studio Prisma', 'studio-prisma', [], [['Guia digital', 'Produtos digitais', 39], ['Consultoria criativa', 'Serviços', 120]]],
];

export const TEST_BUSINESSES = Object.freeze(definitions.map(([segment, name, suffix, extras, products]) => ({
  segment, name, slug: `test-vendeweb-${suffix}`, email: `vendeweb.qa.${suffix}@example.invalid`,
  extraModules: extras, catalog: products.map(([productName, category, price]) => ({ name: productName, category, price, description: 'Dado fictício para testes de homologação. Não realizar pagamento real.' })),
})));
const initialModules = { food: [], florist: ['florist'], retail: [], rentals: ['clients', 'appointments'], personal: ['clients', 'appointments', 'training'], nutrition: ['clients', 'appointments', 'nutrition'], creator: ['creator'] };

export class ProvisionError extends Error {
  constructor(code) { super(code); this.name = 'ProvisionError'; this.code = code; }
}
const fail = code => { throw new ProvisionError(code); };

export function validateTarget(config) {
  if (!['development', 'staging'].includes(config.environment)) fail('NON_PRODUCTION_ENVIRONMENT_REQUIRED');
  const projectRef = String(config.projectRef || '');
  if (BLOCKED_PROJECTS.has(projectRef)) fail('PRODUCTION_PROJECT_BLOCKED');
  if (!/^[a-z0-9]{20}$/.test(projectRef)) fail('EXPLICIT_PROJECT_REF_REQUIRED');
  let url;
  try { url = new URL(config.supabaseUrl || `https://${projectRef}.supabase.co`); } catch { fail('INVALID_SUPABASE_URL'); }
  if (url.protocol !== 'https:' || url.hostname !== `${projectRef}.supabase.co` || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) fail('PROJECT_URL_MISMATCH');
  let app;
  try { app = new URL(config.appOrigin || 'http://localhost:5174'); } catch { fail('INVALID_APP_ORIGIN'); }
  if (blockedOrigins.has(app.hostname) || app.username || app.password || app.search || app.hash || app.pathname !== '/') fail('PRODUCTION_OR_INVALID_APP_ORIGIN');
  if (app.protocol !== 'https:' && !(app.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname))) fail('INSECURE_APP_ORIGIN');
  return { ...config, projectRef, supabaseUrl: url.origin, appOrigin: app.origin };
}

export function publicManifest(appOrigin = 'http://localhost:5174') {
  return TEST_BUSINESSES.map(fixture => ({
    company: fixture.name, segment: fixture.segment, email: fixture.email,
    storefrontUrl: `${appOrigin}/${fixture.slug}`, adminUrl: `${appOrigin}/admin/login`,
    extraModules: fixture.extraModules, status: 'NOT_CREATED', loginValidated: false,
    tenantValidated: false, storefrontValidated: false, profileValidated: false, modulesValidated: false, catalogValidated: false, operationsValidated: false,
  }));
}

export function generateInitialPassword() { return `Vw!${randomBytes(32).toString('base64url')}`; }

export function decryptCredentialEnvelope(envelope, passphrase) {
  // Deliberately no decrypt CLI: callers must keep the plaintext in private memory.
  return import('node:crypto').then(({ createDecipheriv }) => {
    const key = scryptSync(passphrase, Buffer.from(envelope.salt, 'base64'), 32);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  });
}

export function createEncryptedCredentialSink(outputPath, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 20) fail('PRIVATE_PASSPHRASE_MINIMUM_20_CHARACTERS');
  if (!outputPath || !resolve(outputPath).endsWith('.enc.json')) fail('ENCRYPTED_CREDENTIAL_FILE_REQUIRED');
  let parent;
  try { parent = realpathSync(dirname(resolve(outputPath))); } catch { fail('PRIVATE_OUTPUT_DIRECTORY_REQUIRED'); }
  if ((statSync(parent).mode & 0o077) !== 0) fail('OUTPUT_DIRECTORY_MUST_BE_PRIVATE_0700');
  // Never create secrets inside any checkout, even a sibling repository.
  for (let current = parent; ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) fail('CREDENTIAL_FILE_MUST_BE_OUTSIDE_GIT');
    if (dirname(current) === current) break;
  }
  const destination = join(parent, basename(outputPath));
  let fd;
  try { fd = openSync(destination, 'wx', 0o600); closeSync(fd); } catch { fail('CREDENTIAL_FILE_EXISTS_OR_UNWRITABLE'); }
  const save = payload => {
    const salt = randomBytes(16), iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const envelope = { format: 'vendeweb-test-credentials-v1', algorithm: 'aes-256-gcm', kdf: 'scrypt', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(envelope, null, 2), { flag: 'wx', mode: 0o600 });
      renameSync(temporary, destination);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  };
  save({ accounts: [] }); // Check write/encryption before creating an Auth user.
  return save;
}

/** Adapter boundary lets tests exercise guards/idempotency without any network or secret. */
export async function provisionTestBusinesses(config, { adapter, saveCredentials, passwordFactory = generateInitialPassword } = {}) {
  if (!config.allowProvision || config.dryRun) return publicManifest(config.appOrigin);
  const target = validateTarget(config);
  if (!adapter || typeof saveCredentials !== 'function') fail('PRIVATE_RUNTIME_REQUIRED');
  const status = await adapter.environmentStatus();
  if (!status?.enabled || status.environment !== target.environment || status.schema_version !== 1) fail('SERVER_TEST_PROVISIONING_DISABLED');
  const privateAccounts = [];
  const rows = [];
  for (const fixture of TEST_BUSINESSES) {
    const row = publicManifest(target.appOrigin).find(item => item.email === fixture.email);
    let user, privateAccount;
    try {
      user = await adapter.findUser(fixture.email);
      if (user && (user.app_metadata?.vendeweb_test_fixture !== FIXTURE_VERSION || user.app_metadata?.fixture_slug !== fixture.slug)) fail('EXISTING_USER_IS_NOT_THIS_FIXTURE');
      if (!user) {
        const password = passwordFactory();
        user = await adapter.createUser({ email: fixture.email, password, email_confirm: true, app_metadata: { vendeweb_test_fixture: FIXTURE_VERSION, fixture_slug: fixture.slug } });
        if (!user?.id) fail('AUTH_CREATE_FAILED');
        privateAccount = { company: fixture.name, segment: fixture.segment, email: fixture.email, initialPassword: password, userId: user.id, status: 'AUTH_CREATED', storefrontUrl: row.storefrontUrl, adminUrl: row.adminUrl };
        privateAccounts.push(privateAccount);
        // Persist immediately: failure in tenant provisioning never discards a newly created password.
        saveCredentials({ projectRef: target.projectRef, environment: target.environment, accounts: privateAccounts });
      }
      const business = await adapter.provisionBusiness({ p_owner: user.id, p_slug: fixture.slug, p_name: fixture.name, p_segment: fixture.segment, p_catalog: fixture.catalog, p_extra_modules: fixture.extraModules });
      const storeId = business?.store_id || business?.id;
      if (!storeId) fail('TENANT_PROVISIONING_FAILED');
      row.storeId = storeId;
      row.status = privateAccount ? 'CREATED_NOT_VALIDATED' : 'EXISTING_PASSWORD_UNCHANGED';
      if (privateAccount) {
        const validation = await adapter.validateOwner({ email: fixture.email, password: privateAccount.initialPassword, storeId, slug: fixture.slug, segment: fixture.segment, expectedCatalog: fixture.catalog, expectedModules: [...new Set([...initialModules[fixture.segment], ...fixture.extraModules])] });
        row.loginValidated = validation.login === true;
        row.tenantValidated = validation.tenant === true;
        row.storefrontValidated = validation.storefront === true;
        row.profileValidated = validation.profile === true;
        row.modulesValidated = validation.modules === true;
        row.catalogValidated = validation.catalog === true;
        row.status = row.loginValidated && row.tenantValidated && row.storefrontValidated && row.profileValidated && row.modulesValidated && row.catalogValidated ? 'CREATED_BASIC_VALIDATION_PASSED' : 'CREATED_VALIDATION_INCOMPLETE';
        privateAccount.storeId = storeId;
        privateAccount.status = row.status;
        saveCredentials({ projectRef: target.projectRef, environment: target.environment, accounts: privateAccounts });
      }
    } catch (error) {
      row.status = user?.id ? 'FAILED_PARTIAL_NO_AUTOMATIC_DELETE' : 'FAILED_NOT_CREATED';
      row.errorCode = error instanceof ProvisionError ? error.code : 'REMOTE_OPERATION_FAILED';
      if (privateAccount) {
        privateAccount.status = row.status;
        saveCredentials({ projectRef: target.projectRef, environment: target.environment, accounts: privateAccounts });
      }
    }
    rows.push(row);
  }
  return rows;
}

export async function createSupabaseAdapter(target, { serviceKey, publishableKey, fetchImpl = fetch } = {}) {
  if (!serviceKey || !publishableKey) fail('SERVER_AND_PUBLISHABLE_KEYS_REQUIRED');
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url, init) => fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) }) } };
  const admin = createClient(target.supabaseUrl, serviceKey, options);
  const cleanResult = (result, code) => { if (result.error) fail(code); return result.data; };
  return {
    environmentStatus: async () => cleanResult(await admin.rpc('food_test_provisioning_status'), 'SERVER_TEST_PROVISIONING_DISABLED'),
    async findUser(email) {
      for (let page = 1; page <= 100; page++) {
        const data = cleanResult(await admin.auth.admin.listUsers({ page, perPage: 1000 }), 'AUTH_LOOKUP_FAILED');
        const user = data.users.find(item => item.email?.toLowerCase() === email.toLowerCase());
        if (user) return user;
        if (data.users.length < 1000) return null;
      }
      fail('AUTH_LOOKUP_LIMIT_REACHED');
    },
    createUser: async body => cleanResult(await admin.auth.admin.createUser(body), 'AUTH_CREATE_FAILED').user,
    provisionBusiness: async body => cleanResult(await admin.rpc('food_provision_test_business', body), 'TENANT_PROVISIONING_FAILED'),
    async validateOwner({ email, password, storeId, slug, segment, expectedCatalog, expectedModules }) {
      const owner = createClient(target.supabaseUrl, publishableKey, options);
      const publicClient = createClient(target.supabaseUrl, publishableKey, options);
      try {
        const session = cleanResult(await owner.auth.signInWithPassword({ email, password }), 'OWNER_LOGIN_FAILED');
        if (!session.user?.id) return { login: false, tenant: false, storefront: false };
        const members = cleanResult(await owner.from('food_store_users').select('store_id,user_id,role,active').eq('store_id', storeId).eq('user_id', session.user.id), 'OWNER_MEMBERSHIP_READ_FAILED');
        const storefront = cleanResult(await publicClient.rpc('food_get_public_storefront_v1', { p_slug: slug, p_hostname: null }), 'PUBLIC_STOREFRONT_READ_FAILED');
        const business = cleanResult(await owner.rpc('food_business_status', { p_store: storeId }), 'OWNER_BUSINESS_STATUS_FAILED');
        return { login: true,
          tenant: members.some(item => item.active && item.role === 'owner' && item.store_id === storeId),
          storefront: storefront?.found === true && storefront?.store?.id === storeId,
          profile: business?.profile?.store_id === storeId && business?.profile?.primary_segment === segment,
          modules: expectedModules.every(code => business?.modules?.some(item => item.code === code && item.effective === true)),
          catalog: expectedCatalog.every(product => storefront?.products?.some(item => item.name === product.name && item.store_id === storeId)),
        };
      } finally { await owner.auth.signOut({ scope: 'local' }).catch(() => undefined); }
    },
  };
}

export async function main(argv = process.argv.slice(2), env = process.env, print = console.log) {
  const { values } = parseArgs({ args: argv, strict: true, options: {
    environment: { type: 'string' }, 'project-ref': { type: 'string' }, 'supabase-url': { type: 'string' },
    'app-origin': { type: 'string' }, 'credentials-file': { type: 'string' }, 'allow-provision': { type: 'boolean' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) { print('Dry-run: node scripts/provision-test-tenants.mjs\nProvisionar: --environment staging|development --project-ref REF --app-origin URL --allow-provision --credentials-file /diretorio-privado/contas.enc.json\nSecrets somente por env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, VENDEWEB_TEST_CREDENTIALS_PASSPHRASE.'); return []; }
  const config = { environment: values.environment, projectRef: values['project-ref'], supabaseUrl: values['supabase-url'], appOrigin: values['app-origin'] || 'http://localhost:5174', allowProvision: values['allow-provision'] === true, dryRun: values['dry-run'] === true };
  if (!config.allowProvision || config.dryRun) { const rows = publicManifest(config.appOrigin); print(JSON.stringify({ mode: 'DRY_RUN_OFFLINE', accounts: rows }, null, 2)); return rows; }
  const target = validateTarget(config);
  const saveCredentials = createEncryptedCredentialSink(values['credentials-file'], env.VENDEWEB_TEST_CREDENTIALS_PASSPHRASE);
  const adapter = await createSupabaseAdapter(target, { serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
  const rows = await provisionTestBusinesses(target, { adapter, saveCredentials });
  print(JSON.stringify({ mode: 'NON_PRODUCTION_PROVISIONING', environment: target.environment, projectRef: target.projectRef, accounts: rows }, null, 2));
  if (rows.some(row => row.status.startsWith('FAILED') || row.status === 'CREATED_VALIDATION_INCOMPLETE')) process.exitCode = 1;
  return rows;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Provisionamento interrompido: ${error instanceof ProvisionError ? error.code : 'CONFIGURATION_OR_RUNTIME_ERROR'}`); process.exitCode = 1; });
}
