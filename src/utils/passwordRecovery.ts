/** Não expõe existência de conta nem detalhes internos do provedor. */
export function passwordRecoveryError(error: unknown): string {
  const value = error as { message?: string; status?: number; code?: string } | null;
  const message = `${value?.code || ''} ${value?.message || ''}`;
  if (/captcha|turnstile/i.test(message)) return 'A verificação de segurança expirou ou não foi aceita. Faça a verificação novamente.';
  if (value?.status === 429 || /rate.?limit|too many|security purposes/i.test(message)) return 'Aguarde alguns minutos antes de solicitar outro link de recuperação.';
  if (/fetch|network|timeout/i.test(message)) return 'Não foi possível conectar. Confira sua internet e tente novamente após refazer a verificação de segurança.';
  return 'Não foi possível enviar o link de recuperação. Tente novamente após refazer a verificação de segurança.';
}
