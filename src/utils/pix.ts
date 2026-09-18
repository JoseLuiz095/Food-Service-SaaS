const encoder = new TextEncoder();

type TlvField = {
  id: string;
  value: string;
};

const normalize = (value: string) => value.trim().replace(/[\r\n\t]+/g, '');

const parseTlv = (payload: string): TlvField[] => {
  const fields: TlvField[] = [];
  let cursor = 0;

  while (cursor < payload.length) {
    if (cursor + 4 > payload.length) throw new Error('Código PIX Copia e Cola incompleto.');
    const id = payload.slice(cursor, cursor + 2);
    const lengthText = payload.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) throw new Error('Código PIX Copia e Cola inválido.');
    const length = Number(lengthText);
    const start = cursor + 4;
    const end = start + length;
    if (end > payload.length) throw new Error('Código PIX Copia e Cola com tamanho inválido.');
    fields.push({ id, value: payload.slice(start, end) });
    cursor = end;
  }

  return fields;
};

const serializeField = ({ id, value }: TlvField) => {
  const length = value.length;
  if (length > 99) throw new Error(`Campo PIX ${id} excede o tamanho suportado.`);
  return `${id}${String(length).padStart(2, '0')}${value}`;
};

const crc16CcittFalse = (value: string) => {
  let crc = 0xffff;
  for (const byte of encoder.encode(value)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const isDynamicPixPayload = (merchantAccountValue: string) => {
  try {
    const nested = parseTlv(merchantAccountValue);
    const gui = nested.find((field) => field.id === '00')?.value.toUpperCase();
    return gui === 'BR.GOV.BCB.PIX' && nested.some((field) => field.id === '25');
  } catch {
    return false;
  }
};

export const validatePixCopyPasteBase = (raw: string) => {
  const normalized = normalize(raw);
  if (!normalized) throw new Error('Informe o código PIX Copia e Cola.');
  if (!normalized.startsWith('000201')) throw new Error('O código informado não parece ser um PIX Copia e Cola válido.');

  const fields = parseTlv(normalized);
  const merchant = fields.find((field) => field.id === '26');
  if (!merchant) throw new Error('O código PIX não possui os dados de recebimento esperados.');
  if (isDynamicPixPayload(merchant.value)) {
    throw new Error('Este PIX é dinâmico e o valor é controlado pelo banco. Para valor automático pelo carrinho, gere no banco um PIX/QR estático sem valor fixo ou use a opção Chave PIX.');
  }

  return normalized;
};

export const buildPixCopyPasteWithAmount = (raw: string, amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor do PIX inválido.');
  const normalized = validatePixCopyPasteBase(raw);
  const fields = parseTlv(normalized).filter((field) => field.id !== '63' && field.id !== '54');
  const amountField: TlvField = { id: '54', value: amount.toFixed(2) };

  let insertAt = fields.findIndex((field) => field.id === '58');
  if (insertAt < 0) {
    const currencyIndex = fields.findIndex((field) => field.id === '53');
    insertAt = currencyIndex >= 0 ? currencyIndex + 1 : fields.length;
  }
  fields.splice(insertAt, 0, amountField);

  const withoutCrc = fields.map(serializeField).join('') + '6304';
  return withoutCrc + crc16CcittFalse(withoutCrc);
};

const pixSafeText = (value: string, max: number) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase()
  .slice(0, max);

export type StaticPixInput = {
  key: string;
  receiver: string;
  city: string;
  amount: number;
  txid?: string;
};

export const buildStaticPixCopyPaste = ({ key, receiver, city, amount, txid = '***' }: StaticPixInput) => {
  const normalizedKey = key.trim();
  if (!normalizedKey) throw new Error('Informe a chave PIX da plataforma.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor do PIX inválido.');
  const merchantName = pixSafeText(receiver, 25);
  const merchantCity = pixSafeText(city, 15);
  if (!merchantName) throw new Error('Informe o titular do PIX no Admin Master.');
  if (!merchantCity) throw new Error('Informe a cidade do recebedor do PIX no Admin Master.');

  const merchantAccount = [
    serializeField({ id: '00', value: 'BR.GOV.BCB.PIX' }),
    serializeField({ id: '01', value: normalizedKey }),
  ].join('');
  const additional = serializeField({ id: '05', value: pixSafeText(txid, 25) || '***' });
  const fields: TlvField[] = [
    { id: '00', value: '01' },
    { id: '26', value: merchantAccount },
    { id: '52', value: '0000' },
    { id: '53', value: '986' },
    { id: '54', value: amount.toFixed(2) },
    { id: '58', value: 'BR' },
    { id: '59', value: merchantName },
    { id: '60', value: merchantCity },
    { id: '62', value: additional },
  ];
  const withoutCrc = fields.map(serializeField).join('') + '6304';
  return withoutCrc + crc16CcittFalse(withoutCrc);
};
