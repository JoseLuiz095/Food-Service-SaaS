import type { PlatformSettings } from '../types';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  demoEnabled: true,
  demoDurationDays: 14,
  demoWarningDays: 3,
  billingProvider: 'manual',
  billingPixKeyType: '',
  billingPixKey: '',
  billingPixHolderName: '',
  billingPixCity: 'Linhares',
  billingPixCopyPaste: '',
  billingWhatsapp: '',
  billingProofRequired: true,
  billingAutoRenew: false,
  billingGraceDays: 3,
  marketingWhatsapp: '',
  supportWhatsapp: '',
};
