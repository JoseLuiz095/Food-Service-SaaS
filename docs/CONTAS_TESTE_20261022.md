# Sete empresas fictícias — provisionamento e estado real

Data: 22/10/2026. Escopo `shared_future`, somente desenvolvimento/homologação.

**Nenhuma conta real foi criada nesta sessão.** A conexão disponível não fornece um projeto Supabase de desenvolvimento/homologação dos produtos. Os nomes abaixo são fixtures; os e-mails não pertencem a pessoas reais. Não há senhas de login para entregar enquanto as contas não existirem. O dry-run não gera senhas nem lê secrets.

## Manifesto das contas

Origem de exemplo: `http://localhost:5174`. Em homologação, substituir pela origem não produtiva passada em `--app-origin`. Painel de todas as contas: `http://localhost:5174/admin/login`.

| Empresa fictícia | Segmento | E-mail reservado | Vitrine planejada | Conta / senha inicial / validação remota |
| --- | --- | --- | --- | --- |
| Sabor da Vila | Alimentação (`food`) | `vendeweb.qa.sabor-da-vila@example.invalid` | `/test-vendeweb-sabor-da-vila` | NOT_CREATED / inexistente / não executada |
| Jardim Encantado | Floricultura (`florist`) | `vendeweb.qa.jardim-encantado@example.invalid` | `/test-vendeweb-jardim-encantado` | NOT_CREATED / inexistente / não executada |
| Loja Horizonte | Comércio geral (`retail`) | `vendeweb.qa.loja-horizonte@example.invalid` | `/test-vendeweb-loja-horizonte` | NOT_CREATED / inexistente / não executada |
| Festa Nuvem | Serviços e locações (`rentals`) | `vendeweb.qa.festa-nuvem@example.invalid` | `/test-vendeweb-festa-nuvem` | NOT_CREATED / inexistente / não executada |
| Movimento Ativo | Personal (`personal`) | `vendeweb.qa.movimento-ativo@example.invalid` | `/test-vendeweb-movimento-ativo` | NOT_CREATED / inexistente / não executada |
| Equilíbrio Nutri | Nutricionista (`nutrition`) | `vendeweb.qa.equilibrio-nutri@example.invalid` | `/test-vendeweb-equilibrio-nutri` | NOT_CREATED / inexistente / não executada |
| Studio Prisma | Influenciador (`creator`) | `vendeweb.qa.studio-prisma@example.invalid` | `/test-vendeweb-studio-prisma` | NOT_CREATED / inexistente / não executada |

Catálogo: dois itens fictícios por empresa. Os valores são dados de teste, não preços comerciais de planos. Não são gerados pacientes, prontuários, documentos de saúde, cobranças ou pedidos. Cenários complementares:

- Movimento Ativo inclui consultoria e produto físico, usando o catálogo comercial compartilhado.
- Jardim Encantado solicita `clients` e `appointments` como exceções autorizadas de teste.
- Sabor da Vila solicita `events` e `rentals` para testar alimentação com locação.
- Festa Nuvem também recebe os módulos operacionais de eventos/locação.

## Execução offline segura

```sh
node scripts/provision-test-tenants.mjs
node --test scripts/provision-test-tenants.test.mjs
```

O primeiro comando imprime um manifesto JSON com status `NOT_CREATED`. Não faz rede, não cria arquivos de credenciais e não acessa chaves de servidor. `--dry-run` mantém esse comportamento mesmo se `--allow-provision` estiver presente.

## Pré-condições de homologação

1. Identificar um projeto independente de desenvolvimento/homologação e confirmar que integrações de pagamento, notificações e e-mail estão em sandbox/suprimidas. Não usar um projeto de produção com uma loja de teste.
2. Instalar o schema e as migrations compatíveis, revisando o diff e as precondições. O provisionador não aplica migrations nem altera configurações do banco.
3. Um operador do banco habilita explicitamente a configuração privada de provisionamento nesse ambiente. `food_test_provisioning_status()` deve retornar `enabled:true`, `environment:'staging'` ou `'development'` correspondente ao argumento da CLI, e `schema_version:1`. A configuração começa desabilitada e não há botão/API pública para habilitá-la.
4. Guardar a chave de servidor, a publicável e a frase de criptografia fora do repositório e do histórico do terminal. O script lê `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` e `VENDEWEB_TEST_CREDENTIALS_PASSPHRASE` apenas na execução autorizada. Não usar variáveis `VITE_*` para secrets.
5. Preparar uma pasta privada, fora de qualquer checkout Git, com permissão `0700`. O arquivo de saída precisa terminar em `.enc.json`; arquivos existentes nunca são sobrescritos por uma nova execução.

Exemplo, depois de configurar as variáveis por um gerenciador de segredos ou entrada privada:

```sh
node scripts/provision-test-tenants.mjs \
  --environment staging \
  --project-ref REF_DE_HOMOLOGACAO \
  --app-origin https://homologacao.exemplo.invalid \
  --allow-provision \
  --credentials-file /pasta-privada-fora-do-git/vendeweb-contas.enc.json
```

`REF_DE_HOMOLOGACAO` é um placeholder; a CLI exige a referência real de 20 caracteres. A URL Supabase deve corresponder exatamente a esse ref. Referências de produção conhecidas (`elttryavkeartoxgdgse`, `vnpoinodvchmmbyxpacj`) e origens públicas dos produtos são bloqueadas. HTTPS é obrigatório, exceto origem local do frontend. A declaração `--environment staging` sozinha não comprova que um banco seja de homologação: o guard positivo do banco é obrigatório antes de criar usuários Auth.

## Proteção e idempotência

- Supabase Auth usa a API administrativa `createUser` no servidor, com `email_confirm:true`. Não usa signup, convite, recuperação ou envio de confirmação por e-mail.
- Cada senha inicial tem aleatoriedade criptográfica exclusiva, gerada somente quando um usuário é efetivamente criado. Nenhuma senha ou chave é impressa.
- O arquivo é criptografado com AES-256-GCM, chave derivada com scrypt, salt/IV aleatórios e permissão `0600`; a frase deve ter ao menos 20 caracteres e ser entregue separadamente por canal privado.
- Checkpoints criptografados preservam a credencial assim que Auth é criado, antes do provisionamento do tenant. Arquivo não é incluído em Git, PR, README ou logs. Não há CLI que imprima as senhas descriptografadas.
- Usuários existentes só são reutilizados se a marca administrativa de fixture e o slug coincidirem. A senha nunca é redefinida. Uma reexecução não afirma ter validado login de uma conta existente cuja senha não está disponível nessa execução.
- A RPC `food_provision_test_business` é exclusiva de `service_role`, verifica o guard de homologação e atomiza loja, proprietário, perfil/módulos e catálogo. O script não grava diretamente nas tabelas operacionais.
- Em erro parcial, não apaga usuário nem histórico automaticamente. O manifesto registra `FAILED_PARTIAL_NO_AUTOMATIC_DELETE`; um operador avalia a retomada. Mensagens de provedor são reduzidas a códigos seguros, sem despejar payloads ou tokens.

## O que a validação cobre

Para usuários recém-criados, o script valida o login com a chave publicável em cliente isolado, lê o vínculo real de proprietário sujeito a RLS, consulta a vitrine pública pelo slug e confere o catálogo fictício. `food_business_status(p_store)` confirma o segmento e os módulos efetivos iniciais/complementares. O script encerra a sessão local do cliente de teste. Os resultados são campos separados no manifesto; `operationsValidated` permanece `false`, pois criação de itens, contratação e fluxos de cada módulo exigem os testes funcionais/E2E da aplicação.

`CREATED_BASIC_VALIDATION_PASSED` significa apenas os checks básicos descritos, não aprovação completa do segmento. `EXISTING_PASSWORD_UNCHANGED` significa usuário/tenant reaproveitados sem redefinição nem nova validação de login. Contas que falharem na validação têm status explícito e levam a CLI a terminar com código de erro.

Nesta entrega, sete testes locais do provisionador passaram: dry-run sem rede/secrets; bloqueios de produção/URL; guard de servidor desabilitado; criação de sete fixtures e reexecução sem reset; proteção de usuário alheio/erro parcial; criptografia/permissões/recusa de sobrescrita; chamada SDK administrativa sem signup/convite. São testes com adaptadores, sem criação de usuários reais.

Antes de concluir homologação: executar Playwright com as contas reais de teste, conferir menus e capacidades por tenant, cadastrar/editar produto ou serviço, testar contratação e módulos complementares, verificar isolamento permitido/negado e revisar screenshots desktop/mobile. Não usar o manifesto offline como prova de que essas ações ocorreram.

## QA local das sete empresas (23/10/2026)

`qa/tests/modules/segment-platform.spec.ts` e `segment-platform-fixtures.ts` exercitam a aplicação real com transporte Supabase simulado e estado persistente em memória. As sete empresas têm UUIDs, marca, catálogo e permissões distintos. O login é simulado pelo helper existente; estes cenários não criam usuários Auth nem comprovam RLS remota.

Cobertura implementada: sete painéis e sete vitrines em 390 px; ausência de overflow; ausência de erros de página nos painéis; personal salva aluno, serviço e horário, recarrega os registros e exibe o serviço na vitrine; creator salva campanha/link, exibe apenas URL HTTPS segura e recusa referência de campanha alheia no backend simulado; Master concede clientes e agenda à floricultura, refletindo no proprietário após reload sem trocar segmento; resposta atrasada de outro negócio não altera o perfil selecionado; erro de RPC tem recuperação explícita; cadastro por segmento em 390/1366 px sem credenciais ou envio.

Os serviços públicos usam projeção sem dados de clientes. Links de campanha respeitam status ativo e janela de publicação no mock, conforme contrato da RPC; políticas e validações SQL devem ser avaliadas separadamente nos testes PostgreSQL.

Reprodução, dentro de `qa/`:

```sh
PLAYWRIGHT_CHANNEL=chromium-headless-shell npx playwright test --config modules.config.ts tests/modules/segment-platform.spec.ts --output=test-results/platform-verified --reporter=list
```

Evidências PNG ficam nos diretórios de cada caso sob `qa/test-results/platform-verified/`: `painel-*-390.png`, `vitrine-*-390.png`, `personal-agenda-persistida.png`, `master-floricultura-agenda-1366.png`, `floricultura-modulo-complementar-390.png` e `cadastro-nutrition-390.png`/`cadastro-nutrition-1366.png`. Esses arquivos são gerados localmente; não contêm senhas e não representam contas remotas existentes.

Resultado local: **21/21 casos Playwright aprovados** em 47,9 s; **7/7 testes Node do provisionador aprovados**. Após alinhar os mocks ao contrato SQL final (dependências somente `clients` para agenda/treino/nutrição e histórico `action` + `details.module_code`), a revalidação focal aprovou **8/8 casos** em 26,7 s. Painéis e Master com esse contrato final estão em `qa/test-results/platform-owned-contract/`; vitrines e cadastro ficam em `qa/test-results/platform-verified/`. Não houve criação de contas, geração de credenciais reais ou mutação de banco remoto.
