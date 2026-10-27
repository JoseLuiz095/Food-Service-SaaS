# VendeWeb Fitness — acesso e cobrança sandbox

Entrega de 27/10/2026. **Código implementado e testado localmente; sem validação autenticada no Asaas sandbox e sem liberação de produção.** A loja piloto está em criação no Chat 1, conforme confirmação do usuário. O resumo não estava disponível nas fontes acessíveis e a consulta somente leitura não encontrou a conta informada no Auth ativo. Nenhuma loja ou identidade real foi criada nesta tarefa.

## Escopo e fluxo

Classificação: `shared_future`, específico do segmento Personal/Fitness. O Supabase ativo é `elttryavkeartoxgdgse`; todas as tabelas/funções novas usam `food_fitness_*`/`food-fitness-*`. A antiga Academia não foi acessada ou alterada. A cobrança SaaS da loja continua manual; este ciclo atende **assinatura do aluno**, sem conceder papéis em `food_store_users` ou mudar o plano SaaS.

1. O aluno cria sua própria conta ou usa a existente, confirma o e-mail e entra em `/fitness/<store_id>`. Não há senha fixa/compartilhada. Confirmação de e-mail e recuperação dependem do SMTP, CAPTCHA e allowlist de callbacks.
2. Após consentimento explícito de teste, o checkout verifica o JWT no Auth e a existência da sessão no banco. A loja precisa estar aprovada, online, no segmento `personal`, com política Fitness explicitamente habilitada e módulo de acompanhamento efetivo pela licença SaaS existente. Usuário, plano e preço são determinados no servidor.
3. A reserva única por `(store_id,user_id)` congela preço, plano e referência. Apenas a primeira reserva pode criar cliente/assinatura PIX mensal no Asaas sandbox. Repetições consultam e recuperam o mesmo contrato; um timeout inconclusivo nunca repete POST financeiro. Ambiguidades exigem revisão.
4. O webhook valida o token específico e persiste somente ID, tipo e recurso antes de responder 200. O worker consulta o estado atual na API sandbox e confere conta lógica, assinatura, cliente, referência externa, valor bruto e período. A transação registra pagamento, evento e auditoria.
5. O entitlement decorre do período pago e da situação atual da loja. O retorno do navegador ou a criação de uma assinatura não liberam acesso. Cada operação protegida deve exigir `food_fitness_entitlement_v1(store_id)`, que verifica período **e** sessão. Os endpoints futuros de treino precisam incorporar esse guard; fichas existentes não foram alteradas.

PIX recorrente significa geração de cobranças periódicas e renovação após cada pagamento confirmado. Não significa débito automático nem dispensa o pagamento de cada cobrança pelo aluno.

## Regras preparadas, ainda sem ativação comercial

Não há seed da piloto. `enabled=false`, `grace_days=0` e `session_limit=0` são padrões; habilitar exige `policy_approved_at`. Os testes usam configurações descartáveis, não uma aprovação comercial real.

| Evento/situação verificada | Regra implementada |
| --- | --- |
| Pendente, análise de risco, autorização ou recusa | Não cria período pago |
| `CONFIRMED` ou `RECEIVED` | Um período por cobrança; confirmação seguida de recebimento não soma outro mês |
| Renovação paga | Libera o período correspondente ao vencimento, sem antecipar período futuro |
| Vencimento/atraso | Suspende ao terminar cobertura; tolerância configurável só após cobertura efetivamente paga |
| Assinatura inativa/expirada/cancelada | Preserva período já pago; não oferece tolerância após cancelamento |
| Estorno total, pedido de estorno ou chargeback | Revoga a cobertura afetada; nenhuma chamada Auth global |
| Estorno parcial/histórico de estorno ou evento adverso incompatível com a API | Hold conservador para revisão; replay positivo não remove o hold |
| Chargeback revertido, sem hold de inconsistência | Consulta atual confirmada pode restaurar a cobertura ainda vigente |

O ciclo inicial é mensal, preço fixo, BRL implícito da conta Asaas. A cobertura vai de 00:00 do vencimento até um mês de calendário depois, em `America/Sao_Paulo`. Pagamento tardio não desloca automaticamente o ciclo. Juros, descontos, mudança de plano, recontratação após cancelamento e liberação de hold exigem um fluxo comercial explícito; não são inferidos ou concedidos automaticamente neste MVP.

## Sessões e recuperação

`session_limit=1` implementa **uma sessão Fitness por aluno e loja**, com primeiro claim atômico. Não comprova um aparelho físico e não impede totalmente compartilhamento/cópia de credenciais ou tokens. Não utiliza fingerprinting.

- `food_fitness_access_v1(store_id,'status')` separa cobertura financeira (`access`) de autorização da sessão (`session_allowed`). A UI precisa de ambos; esse status não autoriza leitura de treino.
- `claim` reserva uma sessão quando disponível. Uma sessão revogada não pode retomar a vaga; a existência e `not_after` em `auth.sessions` são conferidos no servidor. Sessão encerrada/expirada pode ser substituída e a limpeza é auditada.
- `food_fitness_entitlement_v1(store_id)` é o guard efetivo: falha se qualquer condição de cobertura, loja ou sessão não for satisfeita.
- Logout do portal libera a autorização Fitness e usa `signOut({scope:'local'})`. Não usa logout global para impor limite.
- Perda/troca: administrador da mesma loja, com sessão válida e AAL2, chama `food_fitness_admin_v1(store_id,user_id,'release_sessions','lost_device')`. Motivos aceitos: `lost_device`, `security_review`, `user_request`. A autorização anterior é revogada e o novo login pode fazer claim. A ação é auditada; não exige recriar usuário. A recuperação administrativa está disponível por RPC, ainda sem tela dedicada de gestão.
- Recuperação por e-mail permite redefinir a senha individual e respeita MFA já configurado. A troca de senha pertence à identidade Auth compartilhada e afeta a credencial usada nos demais negócios. Não é prometida recuperação automática da vaga Fitness caso a sessão antiga ainda exista: há o fluxo administrativo acima.

Não ativar `Single session per user` global no Supabase compartilhado. A opção nativa exige Pro+ e é aplicada no refresh, com janela do JWT anterior; afetaria também o FloriWeb. O controle implementado é restrito às operações Fitness protegidas.

## Configuração de homologação pendente

1. Receber do Chat 1 o `store_id`, identidade do proprietário e papéis efetivamente entregues. Conferir associações sem criar nova loja/usuário. Preparar projeto de staging isolado com dependências das tabelas `food_*` e `food_business_private.module_enabled(uuid,text)`; não executar `db push` indiscriminado contra o banco compartilhado.
2. Revisar/aplicar **somente em staging** `20261027135906_food_fitness_access_sandbox.sql` após conferir schema/histórico. Os testes locais usam contratos legados mínimos; não comprovam o histórico remoto inteiro. Não foi aplicada migration remota.
3. Configurar uma linha de `food_fitness_settings` para a loja validada e um plano mensal ativo em `food_fitness_plans`, pelo canal administrativo seguro. Registrar a aprovação das regras antes de habilitar. Nunca relacionar um usuário com base em e-mail arbitrário vindo de webhook/body.
4. Configurar secrets pelo gerenciador seguro do ambiente, fora de chat/Git/logs:

| Secret | Uso |
| --- | --- |
| `FITNESS_ASAAS_SANDBOX_API_KEY` | Chave da conta sandbox, exclusivamente no servidor |
| `FITNESS_ASAAS_SANDBOX_WEBHOOK_TOKEN` | Token próprio do webhook, com 32+ caracteres, distinto da chave da API |
| `FITNESS_BILLING_WORKER_TOKEN` | Token próprio do reconciliador, com 32+ caracteres |
| `FITNESS_ASAAS_ACCOUNT` | Identificador lógico estável da conta sandbox, igual ao cadastro da loja |
| `FITNESS_ALLOWED_ORIGIN` | Origem exata permitida para o checkout de homologação |

As funções também precisam do URL e service/secret key Supabase fornecidos pelo ambiente. O navegador usa somente chave pública. Não copiar tokens, passwords, CPF ou payloads de cartão para logs/auditoria.

5. Publicar em staging `food-fitness-checkout` e `food-fitness-billing`. `verify_jwt=false` é intencional: checkout verifica bearer via `getUser` internamente; billing autentica tokens próprios antes de ler corpo. O workflow de deploy de produção existente não foi ampliado para publicar Fitness automaticamente.
6. Cadastrar webhook **na conta sandbox** para `.../functions/v1/food-fitness-billing/webhook` com os eventos de cobranças/assinaturas relevantes, token específico e alertas de falha. Os endpoints da API e URLs de fatura estão fixados em sandbox; não há switch para produção.
7. Configurar scheduler seguro para POST periódico em `.../functions/v1/food-fitness-billing/reconcile` com `x-fitness-worker-token` no header vindo de Vault/secrets. Sugestão operacional: a cada 2 minutos, monitorando backlog, eventos sem `processed_at`, erros e fila pausada do Asaas. Scheduler/alertas ainda não estão provisionados. Não embutir token em URL ou SQL de job exposto.
8. Conferir SMTP, CAPTCHA e redirects de signup/recovery para `/fitness/<store_id>`. O callback usa o domínio oficial ou localhost pelo helper existente; staging em outro domínio precisa de configuração explícita revisada, não um redirect arbitrário recebido do usuário.

O worker serializa consultas por conta com lease de 60s e fencing de renovação. Processa até 10 eventos, 10 pagamentos históricos e 10 matrículas por lote; relê inclusive pagamentos anteriormente recebidos. Pagina cobranças da assinatura de 25 em 25, com cursor persistido após cada página completa. Limites de 45s, 100 chamadas e 20 páginas retornam `complete:false`/continuação; uma página interrompida é reaplicada com idempotência. Listas por offset podem mudar com novas cobranças; a varredura concluída reinicia em zero para convergir nas próximas rodadas. Falha ou 404 não é presumido como pagamento/cancelamento válido; permanece pendente para investigação. Eventos sem vínculo são classificados e a varredura posterior recupera os pagamentos após o checkout vincular o contrato.

## Nutrição futura

O plano possui entitlement explícito, hoje restrito a `fitness_access`. Não aceita texto livre para criar permissões. A futura extensão deve adicionar `nutrition_access` e papel profissional `nutritionist` por migration revisada, com profissional real aprovado. O vínculo deve usar as mesmas chaves de loja/aluno e nunca conceder clínica somente por pagamento de treino.

Antes de liberar: consentimento por aluno, profissional e finalidade dentro da mesma loja; revogação; dados clínicos em tabelas/Storage privados separados do cadastro administrativo; auditoria de leitura/exportação; retenção definida por classe de dado; exportação e exclusão com exceções legais expressas. Não há dado clínico, credencial, profissional fictício ou permissão Nutrição criado por esta entrega. As políticas concretas e os prazos de retenção/exportação/exclusão clínica permanecem pendentes do fluxo aprovado, não foram inventados.

## Evidência e aceite

| Verificação | Evidência nesta entrega |
| --- | --- |
| Banco e isolamento | `npm run test:fitness`: 81 verificações PostgreSQL e 28 testes de handlers; migration real no PostgreSQL descartável; grants/RLS, pagamento, acesso, sessão, recuperação administrativa, conta/tenant cruzados e integração HTTP→RPC |
| Asaas e Auth externos | Respostas simuladas nos testes; **nenhum teste autenticado no sandbox externo** |
| Frontend | 4 testes Chromium locais, 375 e 1280px, tráfego Supabase interceptado; claim, compra sandbox, query de sucesso sem grant, link inválido, ausência de overflow/erros JS |
| Compatibilidade | Typecheck, build, smoke, fluxo crítico e teste de segmentos aprovados |
| Migrações/deploy | Uma migration criada via CLI e aplicada apenas ao banco descartável; nenhuma publicação de função, migração ou alteração de Auth remoto |
| Estoque e FloriWeb | Nenhuma modificação dos fluxos/tabelas existentes. Fixtures verificam estoque Food inalterado e dado FloriWeb preservado. A divergência informada não foi corrigida |

Testes reproduzíveis: `npm ci`, `npm run test:fitness`, `npm run typecheck`, `npm run build`. Para UI: `npm --prefix qa ci`, instalar Chromium pelo Playwright e `npm run test:fitness:ui`. Dados de teste são sintéticos; os testes não comprovam e-mail real, cobrança real, papel da piloto ou guard aplicado a futuros endpoints de treino.

Antes de produção, ainda é obrigatório validar no sandbox real os nove critérios do pedido, incluindo confirmação/renovação, duplicidade, recusa, atraso, cancelamento, refund/chargeback, perda de webhook, recuperação por e-mail/MFA e troca de sessão. A implantação produtiva demanda mudança deliberada e revisão adicional; esta entrega não a automatiza.

Fontes oficiais verificadas: [webhooks Asaas](https://docs.asaas.com/docs/sobre-os-webhooks), [eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas), [consulta de cobrança](https://docs.asaas.com/reference/recuperar-uma-unica-cobranca), [assinaturas](https://docs.asaas.com/reference/criar-nova-assinatura), [sessões Supabase](https://supabase.com/docs/guides/auth/sessions), [signOut](https://supabase.com/docs/reference/javascript/auth-signout), [recuperação](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail). Changelog Supabase revisado, incluindo a [mudança TLS anunciada em outubro](https://supabase.com/changelog/cbc-tls-ciphers-deprecated); não exige alteração do fluxo implementado.
