# Implantação e teste dos módulos opcionais

## Escopo e preservação

Base final integrada: main `9d5c79f`. A branch incorpora as melhorias de estoque e responsividade já aprovadas em main.
O teste de preservação compara 112 arquivos operacionais a essa base, incluindo vitrine, checkout, Pix, estoque, serviços, tipos, notificações e migrations antigas.
Nenhuma migration ou Edge Function desta entrega foi aplicada em produção. Nenhum pedido de teste foi gravado no banco compartilhado.

## Validação automatizada

```powershell
npm ci
npm --prefix qa ci
npm run test:modules
npm run validate
npm run qa:modules
```

- `test:modules`: fórmula da calculadora, limites, proteção dos 112 arquivos, validações da Edge Function e 58 verificações em PostgreSQL/PGlite descartável.
- `validate`: smoke, fluxo crítico existente, typecheck e build.
- `qa:modules`: 9 cenários no Chrome instalado. Verifica configuração/ocultação em 390, 768 e 1366 px, preço final 3D, catálogo desativado, combo com remoção e Pix único, checkout normal da Doce Lua com retirada e delivery e consulta completa do Master com MFA.
- `deno check --no-config supabase/functions/food-modules-public/index.ts`: tipos da nova Edge Function.
- `git diff --check`: integridade do diff.

Os testes de navegador interceptam as chamadas Supabase, simulam Auth e Turnstile e não gravam pedidos reais. O teste SQL executa as migrations novas sobre contratos mínimos do legado; não reproduz integralmente Supabase Auth/Storage nem carga concorrente de múltiplas conexões. Essa distinção é importante para o teste de staging.

O relatório HTML do navegador fica em `qa/playwright-report/modules/index.html` (não versionado).
O único pacote adicionado é `@electric-sql/pglite@0.3.14`, apenas desenvolvimento, para executar PostgreSQL sem Docker e sem tocar no banco real.

## Implantação em staging

1. Criar backup e revisar o diff das duas migrations novas.
2. Aplicar **somente**, na ordem:
   - `supabase/migrations/20261021143721_foodweb_optional_modules_foundation.sql`;
   - `supabase/migrations/20261021143724_foodweb_optional_modules_transactions.sql`.
3. Não reaplicar migrations antigas, não executar db reset no projeto compartilhado.
4. Publicar somente a função nova: `supabase functions deploy food-modules-public --project-ref SEU_PROJETO_STAGING`.
5. Configurar `PUBLIC_APP_ORIGINS`, `TURNSTILE_SECRET_KEY` e a chave pública `VITE_TURNSTILE_SITE_KEY` do mesmo widget/hostname. A criação de pedidos exige captcha com action `modules`. A função usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY apenas no servidor.
6. `npm run build` e publicar o frontend de staging. O build não publica nada sozinho.
7. Antes de ativar módulos, repetir a venda normal: produto, opções, carrinho, retirada, delivery, Pix, confirmação no painel, estoque/insumos, cancelamento e notificações. Verificar horários de entrega/retirada e agendamento.

As migrations criam apenas novas tabelas/funções/policies, um bucket privado e sua própria policy no Storage. Não alteram dados/policies/triggers das tabelas legadas. O namespace FloriWeb não recebe escrita.

## Eventos e combos — roteiro com duas lojas

1. No Admin Master, criar a segunda loja usando a tela existente de Lojas e clientes. Cadastrar seus usuários e Pix próprios.
2. Entrar como responsável de cada loja e abrir `/admin/modulos` → Configuração. Confirmar que todas as opções estão desmarcadas. Ativar Eventos e Combos somente nas lojas de teste.
3. Definir prazo mínimo, quantidade máxima e percentual de urgência em cada loja.
4. Em Catálogo, cadastrar ofertas com preço e saldo destinado aos módulos. Para serviço/produção sob demanda, deixar saldo vazio. Marcar pronta entrega quando aplicável e publicar.
5. Não repetir o mesmo saldo físico nos catálogos normal e de eventos. A separação é deliberada para preservar a Doce Lua; não existe sincronização automática de produtos/insumos entre os dois.
6. Em Combos, escolher ofertas publicadas dos parceiros, quantidades e descontos. Enviar proposta. Cada fornecedor deve entrar na própria loja e aprovar seus itens. Nem o Master aprova em nome de outra loja.
7. Publicar a versão após todas as aprovações. O vendedor é a loja selecionada na criação, gravada como seller_store_id.
8. Abrir o link de catálogo da loja (rota `/modulos/eventos/ID_DA_LOJA`). Escolher combo e agendamento futuro. Revisar o pedido FW-E, remover um item e conferir o total reduzido. Guardar a URL privada com a chave no fragmento; não compartilhá-la publicamente.
9. Se o prazo mínimo não for atendido, conferir o alerta e a taxa. O fornecedor aceita ou recusa em Pedidos e valores; cobrança fica bloqueada até o aceite ou remoção dos itens recusados.
10. Concluir revisão, gerar Pix e conferir titular/valor do vendedor. Somente depois do crédito bancário, o vendedor informa o valor exato e a referência e confirma o recebimento.
11. Na outra loja, conferir somente sua parte e o A receber. No Master, conferir todas as partes e o total.
12. Cancelar somente a parte do fornecedor. Conferir total vigente, valor originalmente pago, liberação do saldo e obrigação de reembolso. Se já houve repasse, conferir `recovery_due` (valor a recuperar).
13. No Master, cancelar todo o pedido e conferir todos os subpedidos e reembolsos. Reembolso e repasse são registros de ações bancárias feitas manualmente.
14. Criar nova versão do combo depois da venda, mudando itens/preços. Conferir o pedido antigo sem alteração de snapshots.
15. Desativar Eventos/Combos: não deve haver ofertas públicas ou botões desses módulos no painel; pedidos antigos continuam disponíveis em Pedidos e valores.

Uma reserva não paga expira em duas horas. A limpeza é transacional e oportunista em solicitações do endpoint novo; novas tentativas liberam reservas expiradas antes de verificar saldo. O frontend também atualiza o pedido no instante de expiração.
Pix estático não pode ser revogado no banco. Após cancelamento de cobrança pendente, o cliente precisa revisar a nova cobrança; a confirmação rejeita valores antigos. Crédito tardio ou de valor divergente requer conferência humana.

## Personalizados, impressão 3D e aluguel

- Ativar Personalizados. Usar a calculadora: gramas × preço/grama, potência/energia, horas/máquina, mão de obra, acabamento, margem sobre venda e urgência. Alterar o preço final e usar no orçamento.
- Salvar ficha com cliente/empresa, quantidade, tamanho, material, cor, prazo e observações. A calculadora é por unidade; a ficha mostra também o total por quantidade.
- Anexar PNG/JPG/WebP, PDF, STL, OBJ ou 3MF (até 25 MiB) após salvar. Arquivos são privados; downloads usam URL temporária de 60 segundos. Não há upload anônimo: a loja anexa à ficha os arquivos recebidos pelo WhatsApp.
- Registrar a etapa de aprovação de arte no WhatsApp. Para vender a peça pronta, avulsa ou em combo, cadastrar a oferta aprovada no Catálogo dos módulos.
- Ativar Aluguel, cadastrar uma oferta por equipamento e reservar pelo catálogo. Testar sobreposição, manutenção, sinal manual/referência, contrato e os dois checklists.
- O sinal é uma anotação operacional da reserva, sem baixa financeira automática; conferir o saldo ao fechar a cobrança. Reservas, contrato e checklists preparam a operação de aluguel, sem assinatura digital ou gateway de cobrança.

## Reversão e riscos restantes

- Reversão operacional: desativar as quatro flags na configuração das lojas e voltar o frontend, se necessário. Os pedidos existentes permanecem administráveis. Não apagar tabelas/bucket que tenham histórico ou arquivos.
- Executar staging real para Auth/MFA, Storage, origens, captcha, pagamento manual e notificações existentes antes de produção. Não substituir esse teste por uma compra real não autorizada na Doce Lua.
- O catálogo dos módulos usa estoque e financeiro separados do fluxo normal. A receber, repasse e reembolso não são transferências automáticas.
- Listas administrativas mostram até 200 registros por seção nesta versão; futuras operações maiores precisam de paginação/filtros próprios. No Master, **Consultar composição completa** carrega todos os itens, partes, recebíveis e reembolsos do pedido escolhido (até 50 itens por pedido), sem truncar sua composição.
- `npm audit` identificou seis alertas altos na cadeia de desenvolvimento já existente (Vite, Wrangler, Miniflare, Sharp, Undici e source-map-js). Nenhuma atualização desses pacotes foi misturada à entrega. Tratar em atualização específica com nova validação do deploy.
- `npm audit --omit=dev` retornou zero vulnerabilidades nas dependências de produção nesta validação.

## Inventário de arquivos

Modificados:

- `src/App.tsx` — adiciona rotas lazy independentes.
- `src/layouts/AdminLayout.tsx`, `src/layouts/MasterLayout.tsx` — link Módulos opcionais.
- `supabase/config.toml` — configuração somente da função nova.
- `package.json`, `package-lock.json` — dependência de testes e comandos.
- `qa/package.json` — comando da suíte de módulos.
- `README.md`, `PRODUCT.md` — documentação do escopo opcional.

Novos:

- `src/modules/types.ts`, `api.ts`, `calculator.ts`, `modules.css`;
- `src/modules/ModulesPage.tsx`, `EventsPage.tsx`;
- `src/modules/components/ModuleSettingsForm.tsx`, `OffersPanel.tsx`, `CombosPanel.tsx`, `ModuleOrdersPanel.tsx`, `CustomPanel.tsx`, `PrintCalculator.tsx`, `RentalsPanel.tsx`;
- `supabase/functions/food-modules-public/index.ts`;
- as duas migrations listadas na implantação;
- `scripts/test-modules.mjs`, `modules-unit-test.mjs`, `modules-db-test.mjs`, `modules-edge-test.mjs`;
- `qa/modules.config.ts`, `qa/tests/modules/fixtures.ts`, `qa/tests/modules/regression.spec.ts`;
- `docs/MODULOS_OPCIONAIS.md`, este guia.

Nenhum arquivo removido. Nenhum arquivo de `sources/` editado.
