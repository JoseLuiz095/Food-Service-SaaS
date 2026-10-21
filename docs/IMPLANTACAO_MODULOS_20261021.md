# Implantação dos módulos opcionais — 21/10/2026

Publicação autorizada pelo proprietário após testar o funcionamento da Doce Lua. PR #70 incorporado ao main; código publicado a partir de `ca487734e89e484b57d14ccdc70b5cd1b39e7703`.

## Publicações realizadas

| Componente | Identificação |
|---|---|
| Supabase | Projeto compartilhado `elttryavkeartoxgdgse` |
| Migration de fundação | `foodweb_optional_modules_foundation_20261021`, versão remota `20261021154200` |
| Migration de transações | `foodweb_optional_modules_transactions_20261021`, versão remota `20261021154212` |
| Edge Function nova | `food-modules-public`, versão 1, ACTIVE |
| Cloudflare Worker | `foodweb`, versão `7cba2761-7553-40cf-a557-2e11c12f47b0` |
| Site | https://foodweb.joseluizacama.workers.dev |

Os arquivos locais das migrations são `20261021143721_foodweb_optional_modules_foundation.sql` e `20261021143724_foodweb_optional_modules_transactions.sql`. A ferramenta de aplicação registra timestamps próprios no banco. Não executar db push/replay indiscriminadamente: o histórico remoto antigo também difere dos nomes locais.

Somente a função nova foi publicada. As funções de checkout, pagamentos, notificações e criação de lojas existentes não foram republicadas. As variáveis da Cloudflare foram preservadas com `--keep-vars`.

O build preserva a chave pública Turnstile, o projeto Supabase, o slug padrão, a configuração de analytics e o valor VAPID da versão anterior. Nenhum secret foi copiado para frontend ou Git. A configuração local de build está em `.env.production.local`, ignorada pelo Git.

## Estado após implantação

- Nenhuma loja foi provisionada ou ativada nos novos módulos: `food_module_settings` possui zero registros.
- Não há ofertas nem pedidos dos módulos gravados.
- O catálogo público de eventos da Doce Lua retorna `offers: []` e `combos: []`.
- A loja Doce Lua continua ativa, com o mesmo Pix e as mesmas configurações anteriores.
- As 17 tabelas públicas novas têm RLS; o bucket `food-custom-files` é privado, com limite de 25 MiB.

## Validações realizadas

- `npm run test:modules`: 58 verificações PostgreSQL/PGlite, calculadora, testes da Edge Function e preservação de 112 arquivos operacionais.
- `npm run validate`: 177 verificações de smoke, 120 verificações críticas, typecheck e build aprovados com a configuração pública de produção.
- No banco real, um teste transacional com a loja de testes validou criação de ofertas/combos, aprovação, criação do pedido, preço com desconto, bloqueio RLS de usuário sem vínculo, remoção, recálculo, cancelamento e liberação de saldo. A transação foi revertida, com zero configurações, ofertas e pedidos restantes. Sequências podem apresentar lacunas normais após rollback.
- Uma tentativa inicial com a loja `teste` foi corretamente bloqueada porque ela já estava suspensa. Não foi alterada a situação dessa loja; o teste foi executado com a loja de testes que já estava online.
- API pública real: catálogo de eventos desativado responde HTTP 200 vazio; comando administrativo anônimo é recusado; o endpoint novo recusa pedido inexistente sem expor dados.
- Navegador no site publicado: cardápio da Doce Lua e seus dois produtos carregaram; produto → carrinho → checkout; opções de retirada, delivery e Pix visíveis; sem overflow em 390 e 1366 px e sem erro JavaScript.
- Nenhum pedido real foi finalizado pelo teste do navegador. Não houve cobrança, confirmação de pagamento ou reembolso bancário de teste.
- `/admin/modulos` exige login. O catálogo de eventos permanece sem ofertas enquanto desativado.

## Evidência de preservação

Hashes antes e depois da implantação permaneceram iguais:

| Elemento | MD5 de conferência |
|---|---|
| Definições das funções Food existentes | `68cca50c77ed50c9e713e1f25d2d2244` |
| Gatilhos Food existentes | `1e0d6d18a7c11c6513617b210ef4e7a5` |
| Configurações completas da Doce Lua | `58959be52c3e7014b190c4cfe1998639` |

Esses hashes verificam preservação de definições/configurações; não constituem checksum dos pedidos/estoques que continuam operando normalmente. Nenhuma migration nova escreve nas tabelas operacionais antigas.

Foi capturada uma cópia local das definições de funções, gatilhos e policies em `food-pre-modules-schema.log` (ignorada pelo Git). A consulta ao Supabase não listou backups físicos disponíveis nem PITR ativo; essa cópia é de metadados, não um backup completo dos dados. Configurar backup completo continua sendo uma melhoria operacional separada.

## Advisor de segurança

Os alertas relativos aos módulos foram revisados:

- [RLS sem policy no limitador privado](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): intencional. A tabela nega acesso direto e é operada pela função interna com privilégios controlados.
- [SECURITY DEFINER público](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable): somente o catálogo publicado é anônimo; retorna campos explicitamente permitidos.
- [SECURITY DEFINER autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): comandos conferem usuário, loja, organização e MFA para Master. Tabelas não aceitam DML direto do navegador.

O banco compartilhado ainda contém alertas anteriores sobre outras funções e sobre [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) desativada. Nenhuma configuração compartilhada de Auth ou permissão do FloriWeb foi alterada nesta entrega.

## Uso e reversão operacional

Para começar, o responsável abre **Módulos opcionais** no painel, ativa apenas os recursos desejados e cadastra ofertas/parceiros. O Master pode administrar a loja selecionada em `/admin-master/modulos`. Seguir o [roteiro completo](TESTAR_MODULOS_OPCIONAIS.md).

O estoque dos módulos exige alocação própria, sem duplicar saldo físico do catálogo normal. Pix, repasses, reembolsos e sinal permanecem manuais. Uma venda nova com arquivos, urgência e pagamento deve ser acompanhada pelo responsável na primeira utilização, conforme as configurações comerciais da loja.

Reversão operacional: desativar as flags dos módulos e, se necessário, retornar a versão anterior do frontend, `0d0c2bd1-2734-4f36-b04a-700193802686`. Não apagar tabelas, bucket ou snapshots com histórico; a venda normal independe das novas estruturas.
