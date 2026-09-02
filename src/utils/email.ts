const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

const BLOCKED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'teste.com',
  'test.com',
  'invalid.com',
  'localhost',
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'guerrillamail.com',
]);

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'hotnail.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
};

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const emailValidationMessage = (value: string): string => {
  const email = normalizeEmail(value);
  if (!email) return 'Informe o e-mail do responsável.';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Informe um e-mail válido, como nome@gmail.com.';
  const domain = email.split('@')[1] || '';
  if (BLOCKED_DOMAINS.has(domain)) return 'Use um e-mail real. Domínios de teste ou temporários não são permitidos.';
  const suggestedDomain = COMMON_DOMAIN_TYPOS[domain];
  if (suggestedDomain) return `Confira o domínio do e-mail. Você quis dizer @${suggestedDomain}?`;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return 'O domínio do e-mail é inválido.';
  return '';
};

export const isValidAccountEmail = (value: string) => emailValidationMessage(value) === '';

export const temporaryPasswordValidationMessage = (password: string): string => {
  if (password.length < 10) return 'A senha temporária deve ter pelo menos 10 caracteres.';
  if (!/[A-Z]/.test(password)) return 'Inclua pelo menos uma letra maiúscula.';
  if (!/[a-z]/.test(password)) return 'Inclua pelo menos uma letra minúscula.';
  if (!/\d/.test(password)) return 'Inclua pelo menos um número.';
  return '';
};
