import type { Category, DeliveryZone, Product, StoreSettings } from '../types';
import { sanitizeWhatsAppNumber } from './format';

export type StoreReadinessStep = {
  key: 'identity' | 'whatsapp' | 'category' | 'product' | 'payment' | 'fulfillment';
  label: string;
  ready: boolean;
  to: string;
  help: string;
};

export type StoreReadiness = {
  steps: StoreReadinessStep[];
  readyCount: number;
  total: number;
  percent: number;
  launchReady: boolean;
};

export function getStoreReadiness(
  settings: StoreSettings,
  categories: Category[],
  products: Product[],
  deliveryZones: DeliveryZone[],
): StoreReadiness {
  const activeProducts = products.filter((product) => product.active);
  const pixReady = settings.pixEnabled
    && settings.showPixBeforeConfirmation
    && (settings.pixReceiptMode === 'copy_paste'
      ? Boolean(settings.pixCopyPaste.trim())
      : Boolean(settings.pixKey.trim()));
  const paymentReady = settings.confirmationPaymentEnabled
    || pixReady
    || settings.cardPaymentEnabled
    || settings.cashPaymentEnabled;
  const fulfillmentReady = settings.pickupEnabled
    || (settings.deliveryEnabled && deliveryZones.some((zone) => zone.active));

  const steps: StoreReadinessStep[] = [
    {
      key: 'identity',
      label: 'Identidade e localização',
      ready: Boolean(settings.name.trim() && settings.city.trim() && settings.state.trim()),
      to: '/admin/configuracoes',
      help: 'Complete nome, cidade e UF do estabelecimento.',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp da loja',
      ready: sanitizeWhatsAppNumber(settings.whatsapp).length >= 10,
      to: '/admin/configuracoes',
      help: 'Informe o número que receberá os pedidos.',
    },
    {
      key: 'category',
      label: 'Categoria publicada',
      ready: categories.some((category) => category.active),
      to: '/admin/categorias',
      help: 'Crie pelo menos uma categoria ativa.',
    },
    {
      key: 'product',
      label: 'Produto publicado',
      ready: activeProducts.length > 0,
      to: '/admin/produtos',
      help: 'Publique pelo menos um produto para vender.',
    },
    {
      key: 'payment',
      label: 'Forma de pagamento',
      ready: paymentReady,
      to: '/admin/configuracoes',
      help: 'Habilite ao menos uma opção válida de pagamento.',
    },
    {
      key: 'fulfillment',
      label: 'Entrega ou retirada',
      ready: fulfillmentReady,
      to: settings.deliveryEnabled ? '/admin/entregas' : '/admin/configuracoes',
      help: 'Ative retirada ou configure uma área de entrega.',
    },
  ];

  const readyCount = steps.filter((step) => step.ready).length;
  const total = steps.length;
  return {
    steps,
    readyCount,
    total,
    percent: Math.round((readyCount / total) * 100),
    launchReady: readyCount === total,
  };
}
