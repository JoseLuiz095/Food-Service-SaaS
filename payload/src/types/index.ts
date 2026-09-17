export type Role = 'owner' | 'admin' | 'manager' | 'attendant' | 'kitchen' | 'finance' | 'employee';
export type StoreAccessStatus = 'online' | 'suspended';
export type StoreCredentialMode = 'invite' | 'temporary_password';

export type PlatformAdmin = {
  id: string;
  userId: string;
  name: string;
  active: boolean;
};

export type Category = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  sortOrder: number;
};

export type ProductVariation = {
  id: string;
  productId?: string;
  name: string;
  priceDelta: number;
  active: boolean;
  sortOrder: number;
};

export type OptionGroupKind = 'variant' | 'choice' | 'addon' | 'removal';

export type OptionItem = {
  id: string;
  groupId: string;
  storeId: string;
  name: string;
  description?: string;
  priceDelta: number;
  active: boolean;
  sortOrder: number;
};

export type OptionGroup = {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  kind: OptionGroupKind;
  minChoices: number;
  maxChoices: number;
  active: boolean;
  sortOrder: number;
  items: OptionItem[];
};

export type SelectedOption = {
  groupId: string;
  groupName: string;
  groupKind: OptionGroupKind;
  itemId: string;
  itemName: string;
  priceDelta: number;
  quantity: number;
};

export type DeliveryZone = {
  id: string;
  storeId: string;
  name: string;
  aliases: string[];
  city: string;
  state: string;
  fee: number;
  active: boolean;
  sortOrder: number;
};

export type PaymentMethod = 'confirm' | 'pix' | 'card' | 'cash';

export type Addon = {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  price: number;
  active: boolean;
  imageUrl?: string;
  imageStoragePath?: string;
};

export type ProductImage = {
  id: string;
  productId: string;
  url: string;
  storagePath?: string;
  altText?: string;
  sortOrder: number;
  isPrimary: boolean;
};

export type Product = {
  id: string;
  storeId: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  promotionalPrice?: number;
  imageUrl: string;
  gallery: string[];
  images: ProductImage[];
  featured: boolean;
  active: boolean;
  madeToOrder: boolean;
  productionDays: number;
  stockStatus: 'available' | 'low_stock' | 'unavailable';
  stockLabel?: string;
  internalCode?: string;
  availabilityStatus: 'available' | 'unavailable' | 'sold_out';
  trackStock: boolean;
  stockQuantity?: number;
  preparationTimeMinutes: number;
  sortOrder: number;
  optionGroups: OptionGroup[];
  /** Compatibilidade temporária com a estrutura FloriWeb anterior. */
  variations: ProductVariation[];
  /** Compatibilidade temporária com a estrutura FloriWeb anterior. */
  addons: Addon[];
};


export type OpeningDayConfig = {
  day: number;
  enabled: boolean;
  open: string;
  close: string;
  breakStart?: string;
  breakEnd?: string;
};

export type OpeningSchedule = {
  timezone: string;
  days: OpeningDayConfig[];
};

export type StoreSettings = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description?: string;
  city: string;
  state: string;
  zipCode?: string;
  whatsapp: string;
  instagram: string;
  address: string;
  logoUrl: string;
  logoStoragePath?: string;
  heroUrl: string;
  heroStoragePath?: string;
  pixEnabled: boolean;
  pixReceiptMode: 'copy_paste' | 'key';
  pixKeyType: string;
  pixKey: string;
  pixCopyPaste: string;
  pixReceiver: string;
  showPixBeforeConfirmation: boolean;
  confirmationPaymentEnabled: boolean;
  cardPaymentEnabled: boolean;
  cashPaymentEnabled: boolean;
  paymentMethodOrder: PaymentMethod[];
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  minimumOrder: number;
  averagePreparationMin: number;
  averagePreparationMax: number;
  allowScheduledOrders: boolean;
  openingHours: string;
  openingSchedule: OpeningSchedule;
  active: boolean;
  accessStatus?: StoreAccessStatus;
  billingDocument?: string;
  billingPhone?: string;
};

export type Plan = {
  id: string;
  code: string;
  name: string;
  productLimit: number | null;
  imageLimitPerProduct: number | null;
  customDomain: boolean;
  reports: boolean;
  prioritySupport: boolean;
  monthlyPrice?: number;
  setupPrice?: number;
  categoryLimit?: number | null;
  addonLimit?: number | null;
  adminUserLimit?: number | null;
  sortOrder?: number;
  active: boolean;
  featureCodes: string[];
  featureLimits?: Record<string, number | null>;
};

export type BillingProvider = 'manual' | 'asaas';

export type PlatformSettings = {
  demoEnabled: boolean;
  demoDurationDays: number;
  demoWarningDays: number;
  billingProvider: BillingProvider;
  billingPixKeyType: string;
  billingPixKey: string;
  billingPixHolderName: string;
  billingPixCity: string;
  billingPixCopyPaste: string;
  billingWhatsapp: string;
  billingProofRequired: boolean;
  billingAutoRenew: boolean;
  billingGraceDays: number;
  marketingWhatsapp: string;
  supportWhatsapp: string;
};

export type PublicLandingStore = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  city?: string;
  state?: string;
  minimumOrder: number;
  averagePreparationMin: number;
  averagePreparationMax: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
};

export type PublicLandingPlan = {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number;
  productLimit: number | null;
  imageLimitPerProduct: number | null;
  reports: boolean;
  prioritySupport: boolean;
  sortOrder: number;
  featureCodes: string[];
};

export type PublicLandingSnapshot = {
  demoEnabled: boolean;
  demoDurationDays: number;
  marketingWhatsapp: string;
  supportWhatsapp: string;
  stores: PublicLandingStore[];
  plans: PublicLandingPlan[];
};

export type StoreSubscription = {
  id: string;
  storeId: string;
  planId: string;
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  startedAt: string;
  expiresAt?: string;
  plan: Plan;
};

export type PlanUsage = {
  plan: Plan;
  productCount: number;
  activeProductCount: number;
  canCreateProduct: boolean;
  canActivateProduct: boolean;
  subscriptionStatus?: 'trial' | 'active' | 'suspended' | 'cancelled';
  expiresAt?: string;
};

export type StoreUser = {
  id: string;
  storeId: string;
  userId: string;
  role: Role;
  active: boolean;
  mustChangePassword?: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
};

export type CartItem = {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  options: SelectedOption[];
};

export type CheckoutData = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  fulfillment: 'delivery' | 'pickup';
  zipCode: string;
  street: string;
  addressNumber: string;
  complement: string;
  neighborhood: string;
  deliveryZoneId: string;
  deliveryFee: number;
  deliveryCity: string;
  deliveryState: string;
  referencePoint: string;
  notes: string;
  paymentMethod: PaymentMethod;
  needsChange: boolean;
  changeFor: number | null;
  scheduledFor: string;
  reviewConfirmed: boolean;
};

export type OrderStatus = 'received' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'picked_up' | 'cancelled';
export type OrderPaymentStatus = 'pending' | 'paid';


export type CreateOrderResult = {
  orderId: string;
  orderNumber: number;
  total: number;
};

export type OrderConfirmation = {
  orderId: string;
  orderNumber: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerName: string;
  fulfillment: 'delivery' | 'pickup';
  storeName: string;
  storeWhatsapp: string;
  pixEnabled: boolean;
  pixReceiptMode: 'copy_paste' | 'key';
  pixKeyType: string;
  pixKey: string;
  pixCopyPaste: string;
  pixReceiver: string;
  orderMessage: string;
  changeAmount?: number;
  createdAt: string;
};

export type Order = {
  id: string;
  orderNumber: number;
  storeId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryType: 'delivery' | 'pickup';
  desiredDate?: string;
  desiredPeriod?: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryAddress?: string;
  deliveryZipCode?: string;
  deliveryStreet?: string;
  deliveryNumber?: string;
  deliveryComplement?: string;
  deliveryNeighborhood?: string;
  deliveryZoneId?: string;
  deliveryZoneName?: string;
  deliveryFee?: number;
  deliveryCity?: string;
  deliveryState?: string;
  referencePoint?: string;
  cardMessage?: string;
  cardSignature?: string;
  anonymousSender?: boolean;
  notes?: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  total: number;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentReceivedAt?: string;
  paymentConfirmedBy?: string;
  needsChange?: boolean;
  changeFor?: number;
  changeAmount?: number;
  scheduledFor?: string;
  preparationEstimateMinutes?: number;
  source?: 'site' | 'whatsapp' | 'counter' | 'phone' | 'ifood' | 'other';
  whatsappClickedAt?: string;
  createdAt: string;
};

export type SaveProductInput = Omit<Product, 'imageUrl' | 'gallery' | 'images'> & {
  images?: ProductImage[];
};


export type PlatformStoreSummary = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  ownerName?: string;
  ownerEmail?: string;
  active: boolean;
  accessStatus: StoreAccessStatus;
  productCount: number;
  activeProductCount: number;
  adminUserCount: number;
  subscriptionId?: string;
  subscriptionStatus?: 'trial' | 'active' | 'suspended' | 'cancelled';
  planId?: string;
  planName?: string;
  planCode?: string;
  billingAmount?: number;
  dueDay?: number;
  nextDueDate?: string;
  customDomain?: string;
  suspendedAt?: string;
  suspensionReason?: string;
  expiresAt?: string;
};

export type PlatformSystemCheck = {
  version: string;
  platformAdmin: boolean;
  stores: number;
  storesOnline: number;
  storesSuspended: number;
  plans: number;
  subscriptions: number;
  users: number;
  products: number;
  orders: number;
  deliveryZones: number;
  domains: number;
  analyticsEvents?: number;
  analyticsReady?: boolean;
  demoEnabled?: boolean;
  demoTrials?: number;
  demoTrialsExpiringSoon?: number;
  demoDurationDays?: number;
  demoWarningDays?: number;
  demoCronScheduled?: boolean;
  demoCronExists?: boolean;
  demoCronActive?: boolean;
  demoCronSchedule?: string | null;
};

export type PlatformDashboardStats = {
  storesTotal: number;
  storesOnline: number;
  storesSuspended: number;
  storesTrial: number;
  trialsExpiringSoon: number;
  monthlyRecurringRevenue: number;
};
export type PublicAnalyticsEventName = 'storefront_view' | 'product_view' | 'add_to_cart' | 'checkout_started';

export type CheckoutSecurityContext = {
  turnstileToken?: string;
  analyticsSessionId?: string;
  requestId?: string;
};

export type AnalyticsProductStat = {
  productId: string;
  name: string;
  views: number;
  addToCartSessions: number;
  soldUnits: number;
};

export type AnalyticsReport = {
  from: string;
  to: string;
  storefrontSessions: number;
  productViews: number;
  productViewSessions: number;
  addToCartSessions: number;
  checkoutSessions: number;
  orderSessions: number;
  orders: number;
  whatsappClicks: number;
  conversionRate: number;
  cartAbandonmentRate: number;
  checkoutAbandonmentRate: number;
  whatsappRate: number;
  revenue: number;
  averageTicket: number;
  topProducts: AnalyticsProductStat[];
  viewedNotSold: AnalyticsProductStat[];
};



export type SubscriptionPaymentStatus = 'pending' | 'proof_sent' | 'paid' | 'expired' | 'cancelled' | 'refunded' | 'rejected';
export type SubscriptionPaymentProvider = 'manual' | 'asaas';

export type SubscriptionPayment = {
  id: string;
  storeId: string;
  subscriptionId?: string;
  planId: string;
  amount: number;
  dueDate: string;
  provider: SubscriptionPaymentProvider;
  providerPaymentId?: string;
  status: SubscriptionPaymentStatus;
  pixPayload?: string;
  pixQrBase64?: string;
  providerExpirationAt?: string;
  proofRequired: boolean;
  proofSentAt?: string;
  paidAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  paymentIntent?: 'renewal' | 'plan_change';
  previousPlanId?: string;
  storeName?: string;
  planName?: string;
  previousPlanName?: string;
  dueDay?: number;
  nextDueDate?: string;
  billingState?: 'current' | 'overdue' | 'trial' | 'suspended' | 'cancelled' | 'none';
};

export type SubscriptionCharge = {
  payment: SubscriptionPayment;
  plan: { id: string; code: string; name: string; monthlyPrice: number };
  billing?: {
    provider: BillingProvider;
    pixKeyType: string;
    pixKey: string;
    pixHolderName: string;
    pixCity: string;
    pixCopyPaste: string;
    whatsapp: string;
    proofRequired: boolean;
    autoRenew: boolean;
  };
  autoRenew?: boolean;
  environment?: string;
};

export type FinancialDirection = 'income' | 'expense';
export type FinancialEntryStatus = 'pending' | 'paid' | 'cancelled';
export type FinancialDocumentType = 'nfe' | 'nfce' | 'nfse' | 'receipt' | 'boleto' | 'coupon' | 'other' | 'none';

export type FinancialCategory = {
  id: string;
  storeId: string;
  name: string;
  direction: FinancialDirection | 'both';
  active: boolean;
  sortOrder: number;
};

export type FinancialEntry = {
  id: string;
  storeId: string;
  direction: FinancialDirection;
  source: 'manual' | 'order' | 'adjustment';
  orderId?: string;
  categoryId?: string;
  description: string;
  amount: number;
  occurredOn: string;
  dueOn?: string;
  paidAt?: string;
  status: FinancialEntryStatus;
  paymentMethod?: string;
  counterparty?: string;
  documentType: FinancialDocumentType;
  documentNumber?: string;
  notes?: string;
  createdAt: string;
};

export type FinancialDocument = {
  id: string;
  storeId: string;
  entryId?: string;
  storagePath: string;
  originalName: string;
  mimeType?: string;
  extractionStatus: 'pending' | 'processed' | 'failed' | 'manual';
  extractedText?: string;
  extractedJson?: Record<string, unknown>;
  confidence?: number;
  createdAt: string;
};

export type FinancialDocumentSuggestion = {
  direction?: FinancialDirection;
  amount?: number | null;
  occurredOn?: string | null;
  dueOn?: string | null;
  documentType?: FinancialDocumentType;
  documentNumber?: string | null;
  counterparty?: string | null;
  description?: string;
  categoryName?: string | null;
  confidence?: number;
};
