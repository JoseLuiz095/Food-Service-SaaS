/** Mensagens de operação: não expõe nomes de função, schema ou erros SQL no painel. */
export function dashboardErrorMessage(cause: unknown): string {
  const value = cause && typeof cause === 'object' ? cause as { message?: unknown; details?: unknown; status?: unknown } : {};
  const message = typeof value.message === 'string' ? value.message : '';
  if (value.details === 'PGRST202' || (/food_dashboard_metrics_v1/.test(message) && /schema cache|could not find/i.test(message))) {
    return 'Os indicadores ainda não foram ativados. A atualização do painel está pendente.';
  }
  if (value.status === 401 || value.status === 403) return 'Não foi possível validar o acesso aos indicadores. Entre novamente na sua conta.';
  return 'Não foi possível consultar os indicadores agora. Confira sua conexão e tente novamente.';
}
