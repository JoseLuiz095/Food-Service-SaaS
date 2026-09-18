import type { Addon, Category, DeliveryZone, OptionGroup, Order, Plan, Product, StoreSettings, StoreSubscription } from '../types';

const STORE_ID = '00000000-0000-4000-8000-000000000001';

export const seedCategories: Category[] = [
  { id: '10000000-0000-4000-8000-000000000001', storeId: STORE_ID, name: 'Hambúrgueres', slug: 'hamburgueres', active: true, sortOrder: 10 },
  { id: '10000000-0000-4000-8000-000000000002', storeId: STORE_ID, name: 'Porções', slug: 'porcoes', active: true, sortOrder: 20 },
  { id: '10000000-0000-4000-8000-000000000003', storeId: STORE_ID, name: 'Bebidas', slug: 'bebidas', active: true, sortOrder: 30 },
  { id: '10000000-0000-4000-8000-000000000004', storeId: STORE_ID, name: 'Açaí', slug: 'acai', active: true, sortOrder: 40 },
  { id: '10000000-0000-4000-8000-000000000005', storeId: STORE_ID, name: 'Sobremesas', slug: 'sobremesas', active: true, sortOrder: 50 },
];

const linharesZones: Array<[string, string[], number, number]> = [
  ['Centro', [], 5, 10],
  ['Shell', ['Pó do Shell', 'Po do Shell'], 7, 20],
  ['Interlagos', [], 8, 30],
  ['Aviso', [], 10, 40],
  ['Jardim Laguna', ['Jardim Laguna I', 'Jardim Laguna II'], 10, 50],
];

export const seedDeliveryZones: DeliveryZone[] = linharesZones.map(([name, aliases, fee, sortOrder], index) => ({
  id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  storeId: STORE_ID,
  name,
  aliases,
  city: 'Linhares',
  state: 'ES',
  fee,
  active: true,
  sortOrder,
}));

/**
 * Estrutura antiga mantida apenas para compatibilidade com telas legadas durante a transição.
 * Produtos novos usam optionGroups.
 */
export const seedAddons: Addon[] = [];

const group = (
  id: string,
  name: string,
  kind: OptionGroup['kind'],
  minChoices: number,
  maxChoices: number,
  items: Array<[string, number]>,
  sortOrder = 10,
): OptionGroup => ({
  id,
  storeId: STORE_ID,
  name,
  kind,
  minChoices,
  maxChoices,
  active: true,
  sortOrder,
  items: items.map(([itemName, priceDelta], index) => ({
    id: `${id.slice(0, 24)}${String(index + 1).padStart(12, '0')}`,
    groupId: id,
    storeId: STORE_ID,
    name: itemName,
    priceDelta,
    active: true,
    sortOrder: (index + 1) * 10,
  })),
});

const burgerSize = group('61000000-0000-4000-8000-000000000001', 'Tamanho', 'variant', 1, 1, [
  ['Tradicional', 0],
  ['Duplo', 8],
  ['Triplo', 15],
], 10);

const meatPoint = group('61000000-0000-4000-8000-000000000002', 'Ponto da carne', 'choice', 1, 1, [
  ['Mal passada', 0],
  ['Ao ponto', 0],
  ['Bem passada', 0],
], 20);

const burgerAddons = group('61000000-0000-4000-8000-000000000003', 'Adicionais', 'addon', 0, 3, [
  ['Bacon', 4],
  ['Cheddar', 3],
  ['Ovo', 2],
  ['Hambúrguer adicional', 8],
], 30);

const burgerRemovals = group('61000000-0000-4000-8000-000000000004', 'Retirar ingredientes', 'removal', 0, 4, [
  ['Cebola', 0],
  ['Tomate', 0],
  ['Alface', 0],
  ['Molho da casa', 0],
], 40);

const acaiSize = group('61000000-0000-4000-8000-000000000005', 'Tamanho', 'variant', 1, 1, [
  ['300 ml', 0],
  ['500 ml', 5],
  ['700 ml', 9],
], 10);

const acaiComplements = group('61000000-0000-4000-8000-000000000006', 'Complementos', 'addon', 0, 4, [
  ['Banana', 2],
  ['Morango', 3],
  ['Leite em pó', 2.5],
  ['Paçoca', 2],
  ['Nutella', 5],
], 20);

const drinkSize = group('61000000-0000-4000-8000-000000000007', 'Tamanho', 'variant', 1, 1, [
  ['Lata 350 ml', 0],
  ['600 ml', 3],
  ['2 litros', 8],
], 10);

const product = (input: Partial<Product> & Pick<Product, 'id' | 'slug' | 'name' | 'description' | 'categoryId' | 'price' | 'imageUrl'>): Product => ({
  storeId: STORE_ID,
  promotionalPrice: undefined,
  gallery: [input.imageUrl],
  images: [{ id: `${input.id}-img-1`, productId: input.id, url: input.imageUrl, sortOrder: 0, isPrimary: true, altText: input.name }],
  featured: false,
  active: true,
  madeToOrder: false,
  productionDays: 0,
  stockStatus: 'available',
  availabilityStatus: 'available',
  trackStock: false,
  preparationTimeMinutes: 0,
  sortOrder: 0,
  optionGroups: [],
  variations: [],
  addons: [],
  ...input,
});

export const seedProducts: Product[] = [
  product({
    id: '30000000-0000-4000-8000-000000000001', slug: 'x-bacon-artesanal', name: 'X-Bacon Artesanal',
    description: 'Pão brioche, hambúrguer artesanal, bacon crocante, queijo, alface, tomate e molho da casa.',
    categoryId: seedCategories[0].id, price: 28, promotionalPrice: 25.9,
    imageUrl: '/assets/food-burger.svg', featured: true, preparationTimeMinutes: 10, sortOrder: 10,
    optionGroups: [burgerSize, meatPoint, burgerAddons, burgerRemovals],
  }),
  product({
    id: '30000000-0000-4000-8000-000000000002', slug: 'x-salada', name: 'X-Salada',
    description: 'Hambúrguer artesanal, queijo, alface, tomate, cebola e molho especial.',
    categoryId: seedCategories[0].id, price: 23.9, imageUrl: '/assets/food-burger.svg', preparationTimeMinutes: 8, sortOrder: 20,
    optionGroups: [burgerSize, meatPoint, burgerAddons, burgerRemovals],
  }),
  product({
    id: '30000000-0000-4000-8000-000000000003', slug: 'batata-frita', name: 'Batata Frita',
    description: 'Batatas crocantes servidas com molho da casa.',
    categoryId: seedCategories[1].id, price: 18, imageUrl: '/assets/food-fries.svg', preparationTimeMinutes: 5, sortOrder: 10,
    optionGroups: [group('61000000-0000-4000-8000-000000000008', 'Tamanho', 'variant', 1, 1, [['Média', 0], ['Grande', 8]], 10)],
  }),
  product({
    id: '30000000-0000-4000-8000-000000000004', slug: 'refrigerante-cola', name: 'Refrigerante Cola',
    description: 'Escolha o tamanho da bebida.',
    categoryId: seedCategories[2].id, price: 6, imageUrl: '/assets/food-soda.svg', sortOrder: 10,
    optionGroups: [drinkSize],
  }),
  product({
    id: '30000000-0000-4000-8000-000000000005', slug: 'acai-tradicional', name: 'Açaí Tradicional',
    description: 'Açaí cremoso com opções de tamanho e complementos.',
    categoryId: seedCategories[3].id, price: 14, imageUrl: '/assets/food-acai.svg', featured: true, preparationTimeMinutes: 5, sortOrder: 10,
    optionGroups: [acaiSize, acaiComplements],
  }),
  product({
    id: '30000000-0000-4000-8000-000000000006', slug: 'brownie-com-sorvete', name: 'Brownie com Sorvete',
    description: 'Brownie aquecido, sorvete de creme e calda de chocolate.',
    categoryId: seedCategories[4].id, price: 19.9, imageUrl: '/assets/food-dessert.svg', preparationTimeMinutes: 5, sortOrder: 10,
  }),
];

export const seedSettings: StoreSettings = {
  id: STORE_ID,
  slug: 'central-food-demo',
  name: 'Central Food',
  tagline: 'Seu pedido do seu jeito, rápido e sem complicação.',
  description: 'Loja de demonstração da plataforma Food Service.',
  city: 'Linhares', state: 'ES', zipCode: '', whatsapp: '5527999999999', instagram: '@centralfood',
  address: 'Centro, Linhares - ES', logoUrl: '/assets/food-logo.svg', heroUrl: '/assets/food-hero.svg',
  pixEnabled: true, pixReceiptMode: 'key', pixKeyType: 'E-mail', pixKey: 'pix@centralfood.demo', pixCopyPaste: '', pixReceiver: 'Central Food',
  showPixBeforeConfirmation: true, confirmationPaymentEnabled: false, cardPaymentEnabled: true, cashPaymentEnabled: true, paymentMethodOrder: ['pix', 'card', 'cash', 'confirm'], deliveryEnabled: true, pickupEnabled: true, minimumOrder: 20,
  averagePreparationMin: 30, averagePreparationMax: 45, allowScheduledOrders: true,
  openingHours: 'Seg 18:00–23:00 · Ter 18:00–23:00 · Qui 18:00–23:30 · Sex 18:00–00:30 · Sáb 18:00–00:30 · Dom 18:00–23:00',
  openingSchedule: { timezone: 'America/Sao_Paulo', days: [
    { day: 0, enabled: true, open: '18:00', close: '23:00' },
    { day: 1, enabled: true, open: '18:00', close: '23:00' },
    { day: 2, enabled: true, open: '18:00', close: '23:00' },
    { day: 3, enabled: false, open: '18:00', close: '23:00' },
    { day: 4, enabled: true, open: '18:00', close: '23:30' },
    { day: 5, enabled: true, open: '18:00', close: '00:30' },
    { day: 6, enabled: true, open: '18:00', close: '00:30' },
  ] }, active: true, billingDocument:'12345678000190', billingPhone:'5527999999999',
};

export const seedPlan: Plan = {
  id: '40000000-0000-4000-8000-000000000001', code: 'DEMO', name: 'Teste grátis', productLimit: null,
  imageLimitPerProduct: 10, customDomain: false, reports: true, prioritySupport: true, active: true,
  monthlyPrice: 0, setupPrice: 0, categoryLimit: null, addonLimit: null, adminUserLimit: 1, sortOrder: 0,
  featureCodes:['catalog','orders','whatsapp','delivery','billing_pix','analytics','custom_banner','finance','financial_documents'], featureLimits:{},
};

export const seedSubscription: StoreSubscription = {
  id: '41000000-0000-4000-8000-000000000001', storeId: STORE_ID, planId: seedPlan.id, status: 'trial',
  startedAt: new Date().toISOString(), plan: seedPlan,
};

export const seedOrders: Order[] = [];
