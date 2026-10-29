# Recuperação de senha — 29/10/2026

| Achado | Evidência atual | Prioridade | Arquivos | Correção | Dependência | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Recuperação sem CAPTCHA | Captura do usuário: `captcha protection: request disallowed (no captcha_token found)`; formulário e helper omitiam token | Alta | ForgotPassword, supabaseRest, passwordRecovery | Reutilizar Turnstile, exigir e enviar token, renovar após tentativa, mensagens em português | Site key e configuração Auth existentes | Requisição contém captcha_token; expiração/falha bloqueia reenvio sem nova verificação |
| Contraste e marca antigos | axe detectou contraste 4,13:1 em textos/ação; tela ainda usava Food Service SaaS | Média | ForgotPassword, password-recovery.css | Marca VendeWeb e cores locais com contraste AA | Nenhuma | Sem violações graves/críticas na tela e confirmação nas larguras testadas |

## Escopo e evidência

Core, válido para todos os ramos, inclusive Fitness. Não altera sessão, MFA, autorização, senha, SMTP, políticas ou contas reais. A confirmação mantém resposta genérica para não revelar cadastro de e-mail. Links continuam usando `platformOrigin()` e a rota existente de redefinição. Não se enviou e-mail real nem se alterou senha da conta mencionada. Entrega de e-mail e link real ainda precisam de teste pelo titular depois da publicação; não foram comprovados por mocks.

Base: main remota `60c6dd37d56a5a558664de7aa1505e9c1657a3c7` (PR #112 integrado). Comparada com o commit de referência `72b20a2539376f54f86b8e1512e86a057b65191d`, PR #100 integrado e checkouts locais preservados. Nenhuma edição em sources/.

## Validação

- Typecheck, build com destino fictício, smoke (177) e fluxo crítico (122) aprovados.
- Teste unitário de mensagens (6 asserções) aprovado.
- Quatro testes Playwright: 320, 390 e 1366 px; teclado/Enter, token enviado, expiração, erro, link inválido e ausência de overflow.
- axe WCAG 2 A/AA no formulário e confirmação: sem violações graves/críticas.
- Rede e CAPTCHA simulados; tráfego externo bloqueado; dados sintéticos. Teste não comprova widget real, SMTP ou configuração efetiva de redirect do Supabase.

## Risco e reversão

Sem site key, o envio permanece bloqueado com orientação visível: não desabilitar CAPTCHA no projeto compartilhado. Não há migrations ou dependências novas. Reverter este PR restaura o comportamento anterior (inclusive o defeito); alternativa operacional é manter a recuperação indisponível até corrigir a configuração. GitHub/Cloudflare serão conferidos no PR; preview não equivale a deploy de produção.

Referências oficiais consultadas: [CAPTCHA no Supabase](https://supabase.com/docs/guides/auth/auth-captcha), [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail) e changelog. Nenhuma mudança recente de contrato pertinente encontrada.
