/** Nunca retorna o conteúdo da chave, somente mensagens seguras para o build. */
export function validatePublicEnvironment(values) {
  const problems = [];
  for (const [name, value] of Object.entries(values)) {
    const key = String(value || '').trim();
    if (name.startsWith('VITE_') && key.startsWith('sb_secret_')) {
      problems.push(`A variável ${name} contém uma chave privada. Use somente a chave publishable/anon no frontend.`);
    }
    if (['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'].includes(name) && key.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
        if (payload.role !== 'anon') problems.push('O frontend aceita apenas JWT anon, nunca service_role ou tokens de sessão.');
      } catch { problems.push('A chave JWT pública está malformada.'); }
    }
    if (value && /^VITE_.*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|ACCESS_TOKEN|API_TOKEN)/i.test(name)) {
      problems.push(`A variável ${name} expõe uma configuração privada ao navegador. Remova o prefixo VITE_.`);
    }
  }
  return problems;
}
