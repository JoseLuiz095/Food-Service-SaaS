import type { Page } from '@playwright/test';
import type { BusinessSegment } from '../../../src/segments/businessSegments';
import type { ModuleCode } from '../../../src/platform/api';
import { mockBackend, USER, store as baseStore, product as baseProduct, snapshot as baseSnapshot } from './fixtures';

export const testBusinesses = [
  { segment: 'food', name: 'Sabor da Vila', suffix: 'sabor-da-vila', label: 'Alimentação', heading: 'Operação da loja' },
  { segment: 'florist', name: 'Jardim Encantado', suffix: 'jardim-encantado', label: 'Floricultura', heading: 'Arranjos e encomendas' },
  { segment: 'retail', name: 'Loja Horizonte', suffix: 'loja-horizonte', label: 'Produtos e varejo', heading: 'Loja e catálogo' },
  { segment: 'rentals', name: 'Festa Nuvem', suffix: 'festa-nuvem', label: 'Aluguel e eventos', heading: 'Agenda e locações' },
  { segment: 'personal', name: 'Movimento Ativo', suffix: 'movimento-ativo', label: 'Personal trainer', heading: 'Alunos e atendimentos' },
  { segment: 'nutrition', name: 'Equilíbrio Nutri', suffix: 'equilibrio-nutri', label: 'Nutricionista', heading: 'Clientes e consultas' },
  { segment: 'creator', name: 'Studio Prisma', suffix: 'studio-prisma', label: 'Influenciador digital', heading: 'Campanhas e conteúdo' },
].map((item, index) => ({ ...item, segment: item.segment as BusinessSegment, id: `00000000-0000-4000-8000-00000000010${index + 1}`, slug: `test-vendeweb-${item.suffix}`, productId: `20000000-0000-4000-8000-00000000010${index + 1}`, categoryId: `10000000-0000-4000-8000-00000000010${index + 1}` }));

const moduleCodes: ModuleCode[] = ['clients', 'appointments', 'training', 'nutrition', 'creator', 'florist', 'events', 'combos', 'rentals', 'custom'];
const defaults: Record<string, ModuleCode[]> = { food: [], retail: [], florist: ['florist'], rentals: ['clients', 'appointments'], personal: ['clients', 'appointments', 'training'], nutrition: ['clients', 'appointments', 'nutrition'], creator: ['creator'] };
const dependencies: Partial<Record<ModuleCode, ModuleCode[]>> = { appointments: ['clients'], training: ['clients'], nutrition: ['clients'] };
type Row = { id: string; [key: string]: any };
type FixtureBusiness = (typeof testBusinesses)[number];
export type PlatformMockState = { stores: Map<string, { business: FixtureBusiness; segment: BusinessSegment|null; grants: Set<ModuleCode>; audit: Row[]; lists: Record<string, Row[]> }>; writes: { storeId: string; action: string; data: any }[]; nextId: number };

export function createPlatformMockState(): PlatformMockState {
  return { stores: new Map(testBusinesses.map(business => [business.id, { business, segment: business.segment, grants: new Set(defaults[business.segment] || []), audit: [], lists: { clients: [], services: [], appointments: [], followups: [], campaigns: [], links: [] } }])), writes: [], nextId: 1 };
}

/** Stateful transport mock, not an RLS proof. SQL tests independently cover real policies. */
export async function mockSegmentPlatform(page: Page, { master = false, initial = 'personal', state = createPlatformMockState() }: { master?: boolean; initial?: BusinessSegment; state?: PlatformMockState } = {}) {
  await mockBackend(page, { auth: true, master });
  const initialBusiness = testBusinesses.find(item => item.segment === initial)!;
  await page.addInitScript(({ user, store }) => localStorage.setItem(`foodservice.admin.selected-store.v1:${user}`, store), { user: USER, store: initialBusiness.id });
  const storeRow = (business: FixtureBusiness) => ({ ...baseStore, id: business.id, name: business.name, slug: business.slug, description: 'Empresa inteiramente fictícia para validação local.', visual_theme: { preset: 'foodweb', businessSegment: state.stores.get(business.id)?.segment || business.segment }, notifications_desktop_enabled: false, notifications_sound_enabled: false });
  const products = (business: FixtureBusiness) => [{ ...baseProduct, id: business.productId, store_id: business.id, category_id: business.categoryId, name: `Oferta fictícia · ${business.name}`, slug: 'oferta-ficticia' }];
  const categories = (business: FixtureBusiness) => [{ ...baseSnapshot.categories[0], id: business.categoryId, store_id: business.id, name: ['personal', 'nutrition', 'rentals'].includes(business.segment) ? 'Serviços' : business.segment === 'florist' ? 'Arranjos' : 'Catálogo' }];
  const status = (storeId: string) => {
    const record = state.stores.get(storeId)!;
    return { profile: record.segment ? { store_id: storeId, primary_segment: record.segment } : null, legacy: !record.segment, can_initialize: !record.segment,
      modules: moduleCodes.map(code => ({ code, enabled: record.grants.has(code), effective: record.grants.has(code), source: defaults[record.segment || '']?.includes(code) ? 'segment' : record.grants.has(code) ? 'exception' : null, plan_allowed: false, reason: record.grants.has(code) && !defaults[record.segment || '']?.includes(code) ? 'Oficinas fictícias autorizadas' : null, expires_at: null, dependencies: dependencies[code] || [] })), audit: record.audit };
  };
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const body = request.method() === 'GET' ? {} : request.postDataJSON() || {};
    const fulfill = (json: any, code = 200) => route.fulfill({ status: code, json });
    const denied = (message = 'Acesso de teste negado para outro negócio ou módulo não autorizado.') => fulfill({ code: '42501', message }, 403);
    if (path.endsWith('/food_stores')) {
      const id = url.searchParams.get('id');
      return fulfill(testBusinesses.filter(item => !id || !id.startsWith('eq.') || id === `eq.${item.id}`).map(storeRow));
    }
    if (path.endsWith('/food_store_users')) return fulfill(testBusinesses.map((business, index) => ({ id: `90000000-0000-4000-8000-00000000010${index + 1}`, user_id: USER, store_id: business.id, role: 'owner', active: true, must_change_password: false })));
    if (path.endsWith('/food_products') || path.endsWith('/food_categories')) {
      const id = url.searchParams.get('store_id')?.replace('eq.', '');
      const business = testBusinesses.find(item => item.id === id) || initialBusiness;
      return fulfill(path.endsWith('/food_products') ? products(business) : categories(business));
    }
    if (path.endsWith('/food_get_public_storefront_v1')) {
      const business = testBusinesses.find(item => item.slug === body.p_slug) || initialBusiness;
      return fulfill({ ...baseSnapshot, store: storeRow(business), products: products(business), categories: categories(business), delivery_zones: [] });
    }
    if (path.endsWith('/food_business_public')) {
      const record = state.stores.get(body.p_store);
      if (!record) return fulfill({ services: [], links: [] });
      return fulfill({ primary_segment: record.segment,
        services: record.grants.has('appointments') ? record.lists.services.filter(item => item.active !== false && (!['training', 'nutrition'].includes(item.kind) || record.grants.has(item.kind))).map(({ id, name, description, price_cents, duration_minutes }) => ({ id, name, description, price_cents, duration_minutes })) : [],
        links: record.grants.has('creator') ? record.lists.links.filter(item => item.active !== false && (!item.campaign_id || record.lists.campaigns.some(campaign => campaign.id === item.campaign_id && campaign.status === 'active' && new Date(campaign.starts_at).getTime() <= Date.now() && new Date(campaign.ends_at).getTime() >= Date.now()))).map(({ id, label, url }) => ({ id, label, url })) : [] });
    }
    if (path.endsWith('/food_resolve_storefront_status')) return fulfill({ found: true, id: initialBusiness.id, name: initialBusiness.name, status: 'online' });
    if (path.endsWith('/food_business_master') && body.p_action === 'list') return master ? fulfill({ items: testBusinesses.map(item => ({ id: item.id, name: item.name })) }) : denied('Master exige MFA.');
    if (path.endsWith('/food_business_status') || path.endsWith('/food_business_initialize') || path.endsWith('/food_business_master') || path.endsWith('/food_business_operate')) {
      const record = state.stores.get(body.p_store);
      if (!record) return denied();
      if (path.endsWith('/food_business_status')) return fulfill(status(body.p_store));
      if (path.endsWith('/food_business_initialize')) {
        if (record.segment) return denied('Somente o Master pode alterar o segmento principal.');
        record.segment = body.p_segment; record.grants = new Set(defaults[body.p_segment] || []);
        record.audit.unshift({ id: `audit-${state.nextId++}`, action: 'initialize', created_at: new Date().toISOString() });
        return fulfill({ store_id: body.p_store });
      }
      const data = body.p_data || {}, action = body.p_action;
      if (path.endsWith('/food_business_master')) {
        if (!master) return denied('Master exige MFA.');
        if (action === 'set_segment') { record.segment = data.segment; return fulfill({ store_id: body.p_store }); }
        if (!moduleCodes.includes(data.module_code)) return denied('Módulo inexistente.');
        if (action === 'grant') {
          if (!data.reason || data.source !== 'exception' || dependencies[data.module_code as ModuleCode]?.some(code => !record.grants.has(code))) return denied('Dependência ou autorização pendente.');
          record.grants.add(data.module_code);
        } else if (action === 'revoke') record.grants.delete(data.module_code);
        else return denied('Ação indisponível.');
        record.audit.unshift({ id: `audit-${state.nextId++}`, action, details: { module_code: data.module_code, reason: data.reason }, created_at: new Date().toISOString() });
        state.writes.push({ storeId: body.p_store, action, data });
        return fulfill({ store_id: body.p_store });
      }
      const [kind, operation] = String(action).split('.');
      const required = ({ clients: 'clients', services: 'appointments', appointments: 'appointments', followups: 'clients', campaigns: 'creator', links: 'creator' } as Record<string, ModuleCode>)[kind];
      if (!required || !record.grants.has(required)) return denied('Módulo não autorizado para este negócio.');
      if (operation === 'list') return fulfill({ items: record.lists[kind] });
      const list = record.lists[kind];
      const existing = data.id ? list.find(item => item.id === data.id) : null;
      if (data.id && !existing) return denied();
      for (const [key, table] of [['client_id', 'clients'], ['service_id', 'services'], ['campaign_id', 'campaigns']] as const) {
        if (data[key] && !record.lists[table].some(item => item.id === data[key])) return denied('Referência de outro negócio bloqueada pelo backend simulado.');
      }
      if (operation === 'save') {
        if (kind === 'appointments' && list.some(item => item.id !== data.id && !['cancelled', 'completed'].includes(item.status) && new Date(item.starts_at) < new Date(data.ends_at) && new Date(item.ends_at) > new Date(data.starts_at))) return denied('Horário indisponível para este profissional.');
        if (existing) Object.assign(existing, data); else list.push({ ...data, id: `record-${state.nextId++}`, store_id: body.p_store });
      } else if (operation === 'archive' && existing) existing.active = false;
      else if (operation === 'complete' && existing) existing.status = 'completed';
      else if (operation === 'cancel' && existing) existing.status = 'cancelled';
      else if (operation === 'status' && existing) existing.status = data.status;
      else return denied('Ação indisponível.');
      state.writes.push({ storeId: body.p_store, action, data });
      return fulfill({ item: list.find(item => item.id === data.id) || list.at(-1) });
    }
    return route.fallback();
  });
  return { state, initialBusiness, status };
}
