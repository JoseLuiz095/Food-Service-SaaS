export type LocalFinancialDocumentType =
  | 'none'
  | 'nfe'
  | 'nfce'
  | 'nfse'
  | 'receipt'
  | 'boleto'
  | 'coupon'
  | 'other';

export type LocalFinancialReadProgress = {
  percent: number;
  message: string;
};

export type LocalFinancialReadResult = {
  rawText: string;
  documentType: LocalFinancialDocumentType;
  amount?: number;
  occurredOn?: string;
  dueOn?: string;
  counterparty?: string;
  supplierDocument?: string;
  documentNumber?: string;
  description?: string;
  confidence: number;
  recognizedFields: number;
  signals: string[];
  barcode?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2200;
const MAX_UPSCALE = 2.7;
const MAX_DIGITAL_PDF_PAGES = 3;

const compactWhitespace = (value: string) =>
  value
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const searchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/R[5S\u00a7]\s*/g, 'R$ ')
    .replace(/\|/g, 'I');

const digitsOnly = (value: string) => value.replace(/\D/g, '');

export const normalizeCounterpartyKey = (value: string) =>
  searchText(value)
    .replace(/\b(LTDA|ME|EPP|EIRELI|SA|S A|M E)\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();

function ensureAllowedFile(file: File) {
  const allowed = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ]);

  if (!allowed.has(file.type)) {
    throw new Error('Formato nao suportado. Envie JPG, PNG, WEBP ou PDF.');
  }

  if (file.type === 'application/pdf' && file.size > MAX_PDF_BYTES) {
    throw new Error('O PDF deve possuir no maximo 10 MB.');
  }

  if (file.type !== 'application/pdf' && file.size > MAX_IMAGE_BYTES) {
    throw new Error('A imagem deve possuir no maximo 8 MB.');
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao preparar a imagem.'))),
      'image/jpeg',
      0.94,
    );
  });
}

async function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Nao foi possivel abrir a imagem enviada.'));
      image.src = url;
    });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value];

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestThreshold = 170;

  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;

    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = value;
    }
  }

  return Math.max(120, Math.min(215, bestThreshold));
}

type PreprocessMode = 'balanced' | 'threshold';

async function preprocessImage(blob: Blob, mode: PreprocessMode = 'balanced'): Promise<Blob> {
  const image = await imageFromBlob(blob);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const longest = Math.max(sourceWidth, sourceHeight);
  let scale = MAX_IMAGE_SIDE / Math.max(1, longest);
  if (scale > 1) scale = Math.min(MAX_UPSCALE, scale);

  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('O navegador nao conseguiu preparar a imagem.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const histogram = new Array<number>(256).fill(0);
  const greyValues = new Uint8Array(width * height);

  for (let index = 0, pixelIndex = 0; index < pixels.length; index += 4, pixelIndex += 1) {
    const grey = Math.max(0, Math.min(255, Math.round(
      pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114,
    )));
    greyValues[pixelIndex] = grey;
    histogram[grey] += 1;
  }

  const threshold = otsuThreshold(histogram, greyValues.length);

  for (let index = 0, pixelIndex = 0; index < pixels.length; index += 4, pixelIndex += 1) {
    const grey = greyValues[pixelIndex];
    const value = mode === 'threshold'
      ? (grey < threshold ? 0 : 255)
      : Math.max(0, Math.min(255, (grey - 128) * 1.28 + 128));

    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas);
}

async function detectBarcode(blob: Blob): Promise<string | undefined> {
  const Detector = (window as typeof window & {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;

  if (!Detector || typeof createImageBitmap !== 'function') return undefined;

  try {
    const detector = new Detector({ formats: ['itf', 'code_128', 'qr_code'] });
    const bitmap = await createImageBitmap(blob);
    try {
      const result = await detector.detect(bitmap);
      return result
        .map((item) => item.rawValue || '')
        .find((value) => digitsOnly(value).length >= 20);
    } finally {
      bitmap.close();
    }
  } catch {
    return undefined;
  }
}

function mergeOcrText(first: string, second: string): string {
  const one = compactWhitespace(first);
  const two = compactWhitespace(second);
  if (!one) return two;
  if (!two || two === one) return one;
  return `${one}\n\n--- LEITURA REFORCADA ---\n${two}`;
}

type CachedOcrWorker = {
  recognize(source: Blob): Promise<{ data: { text?: string } }>;
  terminate(): Promise<void>;
};

let cachedOcrWorkerPromise: Promise<CachedOcrWorker> | null = null;
let activeOcrProgress: ((value: LocalFinancialReadProgress) => void) | undefined;
let ocrCleanupInstalled = false;

async function getCachedOcrWorker(onProgress?: (value: LocalFinancialReadProgress) => void): Promise<CachedOcrWorker> {
  activeOcrProgress = onProgress;

  if (!cachedOcrWorkerPromise) {
    cachedOcrWorkerPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker('por', 1, {
        logger: (event) => {
          if (event.status === 'recognizing text' && typeof event.progress === 'number') {
            activeOcrProgress?.({
              percent: Math.round(28 + event.progress * 42),
              message: 'Lendo o texto do documento no seu aparelho...',
            });
          }
        },
      }) as unknown as Promise<CachedOcrWorker>)
      .catch((error) => {
        cachedOcrWorkerPromise = null;
        throw error;
      });
  }

  if (!ocrCleanupInstalled && typeof window !== 'undefined') {
    ocrCleanupInstalled = true;
    window.addEventListener('pagehide', () => {
      const current = cachedOcrWorkerPromise;
      cachedOcrWorkerPromise = null;
      activeOcrProgress = undefined;
      if (current) void current.then((worker) => worker.terminate()).catch(() => undefined);
    }, { once: true });
  }

  return cachedOcrWorkerPromise;
}

async function runSmartOcr(
  primary: Blob,
  secondaryFactory: () => Promise<Blob>,
  barcode?: string,
  onProgress?: (value: LocalFinancialReadProgress) => void,
): Promise<string> {
  const worker = await getCachedOcrWorker(onProgress);

  try {
    const first = compactWhitespace((await worker.recognize(primary)).data.text || '');
    const firstParsed = parseResult(first, barcode);

    if (firstParsed.amount !== undefined && firstParsed.recognizedFields >= 3) {
      return first;
    }

    onProgress?.({
      percent: 74,
      message: 'Aplicando leitura reforcada para localizar valor e campos faltantes...',
    });

    const secondary = await secondaryFactory();
    const second = compactWhitespace((await worker.recognize(secondary)).data.text || '');
    return mergeOcrText(first, second);
  } finally {
    activeOcrProgress = undefined;
  }
}

async function extractPdf(
  file: File,
  onProgress?: (value: LocalFinancialReadProgress) => void,
): Promise<{ text: string; barcode?: string }> {
  onProgress?.({ percent: 8, message: 'Abrindo o PDF...' });

  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);

  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_DIGITAL_PDF_PAGES);
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    pages.push(pageText);
  }

  const digitalText = compactWhitespace(pages.join('\n'));
  if (digitalText.replace(/\s/g, '').length >= 80) {
    onProgress?.({ percent: 78, message: 'Texto encontrado diretamente no PDF.' });
    return { text: digitalText };
  }

  onProgress?.({ percent: 18, message: 'PDF digitalizado. Preparando a primeira pagina...' });
  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 2.4 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nao foi possivel preparar o PDF para leitura.');

  await firstPage.render({ canvas, canvasContext: context, viewport }).promise;
  const pageBlob = await canvasToBlob(canvas);
  const prepared = await preprocessImage(pageBlob, 'balanced');
  const barcode = await detectBarcode(prepared);
  const text = await runSmartOcr(
    prepared,
    () => preprocessImage(pageBlob, 'threshold'),
    barcode,
    onProgress,
  );
  return { text, barcode };
}

function parseMoney(raw: string): number | undefined {
  let value = raw
    .replace(/R[\$5S\u00a7]/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!value) return undefined;

  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) value = value.replace(/\./g, '').replace(',', '.');
    else value = value.replace(/,/g, '');
  } else if (comma >= 0) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0 && value.length - dot - 1 !== 2) {
    value = value.replace(/\./g, '');
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const MONEY_RE = /(?:R[\$5S\u00a7]\s*)?(?:\d{1,3}(?:[.,\s]\d{3})+|\d+)[.,]\d{2}/gi;

function moneyValues(line: string): number[] {
  const values = (line.match(MONEY_RE) || [])
    .map(parseMoney)
    .filter((value): value is number => value !== undefined);
  return [...new Set(values)];
}

function boletoDigits(text: string, detected?: string): string | undefined {
  const direct = digitsOnly(detected || '');
  if ([44, 47, 48].includes(direct.length)) return direct;

  const lines = text.split('\n');
  const candidates: string[] = [];

  for (const line of lines) {
    const normalized = digitsOnly(line);
    if ([44, 47, 48].includes(normalized.length)) candidates.push(normalized);

    const formatted = line.match(/[\d.\s-]{35,90}/g) || [];
    for (const chunk of formatted) {
      const digits = digitsOnly(chunk);
      if ([44, 47, 48].includes(digits.length)) candidates.push(digits);
    }
  }

  const chunks = text.match(/[\d.\s-]{35,90}/g) || [];
  for (const chunk of chunks) {
    const digits = digitsOnly(chunk);
    if ([44, 47, 48].includes(digits.length)) candidates.push(digits);
  }

  return candidates[0];
}

function amountFromBoletoDigits(value?: string): number | undefined {
  if (!value) return undefined;
  const digits = digitsOnly(value);
  if (digits.length === 44) {
    const amount = Number(digits.slice(9, 19)) / 100;
    return amount > 0 ? amount : undefined;
  }
  if (digits.length === 47) {
    const amount = Number(digits.slice(37, 47)) / 100;
    return amount > 0 ? amount : undefined;
  }
  return undefined;
}

type AmountCandidate = {
  value: number;
  score: number;
  lineIndex: number;
};

function scoreAmountContext(context: string, type: LocalFinancialDocumentType): number {
  const normalized = searchText(context);
  let score = 0;

  if (/VALOR\s+COBRADO/.test(normalized)) score += 180;
  if (/VALOR\s+DO\s+DOCUMENTO/.test(normalized)) score += 170;
  if (/TOTAL\s+A\s+PAGAR/.test(normalized)) score += 160;
  if (/VALOR\s+TOTAL/.test(normalized)) score += 150;
  if (/TOTAL\s+R\$/.test(normalized)) score += 145;
  if (/\bTOTAL\b/.test(normalized)) score += 120;
  if (/PAGAR|LIQUIDO/.test(normalized)) score += 70;

  if (/VALOR\s+APROXIMADO|TRIBUT|IMPOST/.test(normalized)) score -= 150;
  if (/VL\s*UNIT|VALOR\s+UNIT|UNITARIO|PRECO\s+UNIT/.test(normalized)) score -= 120;
  if (/DESCONTO|ABATIMENTO|DEDUC|MORA|MULTA|ACRESCIMO|TROCO/.test(normalized)) score -= 100;
  if (/PARCELA|QTD|QUANTIDADE/.test(normalized)) score -= 35;

  if (type === 'boleto' && /BOLETO|CEDENTE|BENEFICIARIO|VENCIMENTO/.test(normalized)) score += 20;
  if (type === 'coupon' && /CUPOM|ECF|CCF|COO/.test(normalized)) score += 15;

  return score;
}

function amountCandidates(text: string, type: LocalFinancialDocumentType): AmountCandidate[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const candidates: AmountCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const values = moneyValues(lines[index]);
    if (!values.length) continue;

    const context = [
      lines[index - 1] || '',
      lines[index],
      lines[index + 1] || '',
      lines[index + 2] || '',
    ].join(' ');

    const baseScore = scoreAmountContext(context, type);
    for (const value of values) {
      if (value <= 0) continue;
      candidates.push({ value, score: baseScore, lineIndex: index });
    }
  }

  return candidates;
}

function extractAmount(text: string, type: LocalFinancialDocumentType, barcode?: string): number | undefined {
  const fromBarcode = amountFromBoletoDigits(boletoDigits(text, barcode));
  if (fromBarcode !== undefined) return fromBarcode;

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const labels = [
    /VALOR\s+COBRADO/,
    /VALOR\s+DO\s+DOCUMENTO/,
    /TOTAL\s+A\s+PAGAR/,
    /VALOR\s+TOTAL/,
    /TOTAL\s+R\$/,
    /^TOTAL\b/,
  ];

  for (const label of labels) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!label.test(searchText(lines[index]))) continue;
      const windowText = lines.slice(index, index + 4).join(' ');
      const values = moneyValues(windowText);
      if (values.length) return values[values.length - 1];
    }
  }

  const candidates = amountCandidates(text, type);
  if (!candidates.length) return undefined;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((type === 'boleto' || type === 'coupon') && b.value !== a.value) return b.value - a.value;
    return a.lineIndex - b.lineIndex;
  });

  if (candidates[0].score >= 40) return candidates[0].value;

  if (type === 'boleto' || type === 'coupon' || type === 'receipt') {
    return [...candidates].sort((a, b) => b.value - a.value)[0]?.value;
  }

  return undefined;
}

function toIsoDate(day: string, month: string, year: string): string | undefined {
  let fullYear = Number(year);
  if (fullYear < 100) fullYear += fullYear >= 70 ? 1900 : 2000;
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const date = new Date(fullYear, numericMonth - 1, numericDay);
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() !== numericMonth - 1 ||
    date.getDate() !== numericDay
  ) return undefined;
  return `${String(fullYear).padStart(4, '0')}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`;
}

function firstDate(value: string): string | undefined {
  const match = value.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  return match ? toIsoDate(match[1], match[2], match[3]) : undefined;
}

function dateNearLabels(text: string, labels: RegExp[]): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const label of labels) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!label.test(searchText(lines[index]))) continue;
      const date = firstDate(lines.slice(Math.max(0, index - 1), index + 4).join(' '));
      if (date) return date;
    }
  }
  return undefined;
}

function extractOccurredOn(text: string): string | undefined {
  return dateNearLabels(text, [
    /DATA\s+DO\s+DOCUMENTO/,
    /DATA\s+DE\s+EMISSAO/,
    /EMISSAO/,
    /DATA/,
  ]) || firstDate(text);
}

function extractDueOn(text: string): string | undefined {
  return dateNearLabels(text, [/VENCIMENTO/, /VENC\.?/]);
}

function extractSupplierDocument(text: string): string | undefined {
  const explicit = text.match(/(?:CNPJ|CPF)[^\d]{0,12}(\d[\d.\/\-\s]{9,24}\d)/i);
  if (explicit) {
    const value = digitsOnly(explicit[1]);
    if (value.length === 11 || value.length === 14) return value;
  }
  const candidates = (text.match(/\d{2,3}[.\s]?\d{3}[.\s]?\d{3}[\/\s.-]?\d{4}[-.\s]?\d{2}/g) || [])
    .map(digitsOnly)
    .filter((value) => value.length === 14);
  return candidates[0];
}

function looksLikeBusinessName(value: string): boolean {
  const normalized = searchText(value);
  if (value.length < 4 || value.length > 120) return false;
  if (/CNPJ|CPF|CEP|ENDERE|RUA|AV\.?\s|AVENIDA|TOTAL|VALOR|DATA|CUPOM|FISCAL|DOCUMENTO|ITEM|QTD|QUANTIDADE|TELEFONE|INSCRICAO|IE\b|IM\b/.test(normalized)) return false;
  const letters = (value.match(/[A-Za-z\u00c0-\u00ff]/g) || []).length;
  const digits = (value.match(/\d/g) || []).length;
  return letters >= 4 && letters > digits;
}

function extractSupplier(text: string): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const labels = [/BENEFICIARIO/, /CEDENTE/, /EMITENTE/, /FORNECEDOR/, /RAZAO\s+SOCIAL/];

  for (let index = 0; index < lines.length; index += 1) {
    for (const label of labels) {
      const normalized = searchText(lines[index]);
      if (!label.test(normalized)) continue;
      const colon = lines[index].split(/[:\-]/).slice(1).join('-').trim();
      if (colon && looksLikeBusinessName(colon)) return colon;
      for (let offset = 1; offset <= 3; offset += 1) {
        const next = lines[index + offset];
        if (next && looksLikeBusinessName(next)) return next;
      }
    }
  }

  return lines.slice(0, 15).find(looksLikeBusinessName);
}

function identifyType(text: string, barcode?: string): LocalFinancialDocumentType {
  const normalized = searchText(text);
  const boleto = boletoDigits(text, barcode);
  if (boleto || /BOLETO|LINHA\s+DIGITAVEL|NOSSO\s+NUMERO|FICHA\s+DE\s+COMPENSACAO/.test(normalized)) return 'boleto';
  if (/NFC-E|NFCE/.test(normalized)) return 'nfce';
  if (/NFS-E|NFSE|NOTA\s+FISCAL\s+DE\s+SERVICO/.test(normalized)) return 'nfse';
  if (/NF-E|NOTA\s+FISCAL\s+ELETRONICA/.test(normalized)) return 'nfe';
  if (/CUPOM\s+FISCAL|\bCCF\b|\bCOO\b|\bECF\b/.test(normalized)) return 'coupon';
  if (/RECIBO/.test(normalized)) return 'receipt';
  return 'other';
}

function extractDocumentNumber(text: string, type: LocalFinancialDocumentType): string | undefined {
  const patterns = type === 'coupon'
    ? [
        /(?:COO|CCF|CUPOM)\s*[:\u00ba\u00b0#-]?\s*(\d{3,20})/i,
        /CONTROLE\s*[:\u00ba\u00b0#-]?\s*(\d{3,20})/i,
      ]
    : [
        /(?:NUMERO\s+DO\s+DOCUMENTO|NUMERO|N[\u00ba\u00b0]|NF[-\s]?E?)\s*[:\u00ba\u00b0#-]?\s*([A-Z0-9.\/-]{2,30})/i,
      ];

  for (const pattern of patterns) {
    const match = searchText(text).match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function typeLabel(type: LocalFinancialDocumentType): string {
  const labels: Record<LocalFinancialDocumentType, string> = {
    none: 'Documento',
    nfe: 'NF-e',
    nfce: 'NFC-e',
    nfse: 'NFS-e',
    receipt: 'Recibo',
    boleto: 'Boleto',
    coupon: 'Cupom fiscal',
    other: 'Documento',
  };
  return labels[type];
}

function parseResult(text: string, barcode?: string): LocalFinancialReadResult {
  const documentType = identifyType(text, barcode);
  const amount = extractAmount(text, documentType, barcode);
  const occurredOn = extractOccurredOn(text);
  const dueOn = extractDueOn(text);
  const counterparty = extractSupplier(text);
  const supplierDocument = extractSupplierDocument(text);
  const documentNumber = extractDocumentNumber(text, documentType);
  const signals: string[] = [];

  if (documentType !== 'other') signals.push(typeLabel(documentType));
  if (counterparty) signals.push('Fornecedor/origem');
  if (supplierDocument) signals.push('CPF/CNPJ');
  if (amount !== undefined) signals.push('Valor');
  if (occurredOn) signals.push('Data');
  if (dueOn) signals.push('Vencimento');
  if (documentNumber) signals.push('Numero do documento');
  if (boletoDigits(text, barcode)) signals.push('Codigo de barras/linha digitavel');
  if (text.includes('--- LEITURA REFORCADA ---')) signals.push('OCR reforcado');

  const recognizedFields = [counterparty, amount, occurredOn, dueOn, documentNumber]
    .filter((value) => value !== undefined && value !== '').length;

  let score = 0;
  if (counterparty) score += 0.25;
  if (supplierDocument) score += 0.1;
  if (amount !== undefined) score += 0.3;
  if (occurredOn) score += 0.2;
  if (documentType !== 'other') score += 0.1;
  if (documentNumber) score += 0.05;

  return {
    rawText: text,
    documentType,
    amount,
    occurredOn,
    dueOn,
    counterparty,
    supplierDocument,
    documentNumber,
    description: counterparty ? `${typeLabel(documentType)} - ${counterparty}` : typeLabel(documentType),
    confidence: Math.min(1, score),
    recognizedFields,
    signals,
    barcode: boletoDigits(text, barcode),
  };
}

export async function readLocalFinancialDocument(
  file: File,
  onProgress?: (value: LocalFinancialReadProgress) => void,
): Promise<LocalFinancialReadResult> {
  ensureAllowedFile(file);
  onProgress?.({ percent: 4, message: 'Preparando o documento...' });

  let text = '';
  let barcode: string | undefined;

  if (file.type === 'application/pdf') {
    const result = await extractPdf(file, onProgress);
    text = result.text;
    barcode = result.barcode;
  } else {
    onProgress?.({ percent: 10, message: 'Ampliando e otimizando a foto para leitura...' });
    const prepared = await preprocessImage(file, 'balanced');
    onProgress?.({ percent: 22, message: 'Procurando codigo de barras e preparando OCR...' });
    barcode = await detectBarcode(prepared);
    text = await runSmartOcr(
      prepared,
      () => preprocessImage(file, 'threshold'),
      barcode,
      onProgress,
    );
  }

  if (text.replace(/\s/g, '').length < 10 && !barcode) {
    throw new Error('Nao foi possivel ler texto suficiente. Tire outra foto com boa luz, sem cortes e com o documento inteiro visivel.');
  }

  onProgress?.({ percent: 92, message: 'Identificando valor, data, vencimento e fornecedor...' });
  const result = parseResult(text, barcode);
  onProgress?.({ percent: 100, message: 'Leitura concluida. Revise os campos antes de salvar.' });
  return result;
}
