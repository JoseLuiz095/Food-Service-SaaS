# Piloto Fitness/Academia — entrega local e transição ao Chat 2

## Continuação em 28/10/2026 — catálogo e prontidão

Na branch `codex/fitness-catalog-readiness`, a vitrine Fitness ganhou catálogo de produtos publicados com busca por nome/descrição, filtro por categoria e detalhe de consulta. Serviços gerais com descrição, preço e duração preenchidos aparecem em consulta, sem botão de reserva; acompanhamento permanece na agenda existente. Produtos inativos não aparecem para o público, e carrinho e checkout Fitness seguem bloqueados. O Admin pode preparar categorias e produtos em rascunho pelos formulários existentes. Não foram criados produtos ou regras comerciais fictícios.

Consulta de leitura ao Supabase ativo em 28/10 confirmou **zero** lojas FabricioFITNESS, **zero** usuários Auth do e-mail do piloto e **zero** fichas Fitness. As cinco migrations Fitness constam no histórico remoto. Nenhuma migration, Edge Function, dado ou permissão foi alterado nesta continuação. A página Admin Master abriu na tela de login; o provisionamento oficial ainda exige uma sessão autenticada com MFA/AAL2.

Validação local: `npm run build`, `npm run smoke` (177 verificações), `npm run test:fitness-pilot-db`, `npm run test:provision` (7 testes) e `npm run test:fitness:ui` (8 cenários em Chromium, incluindo catálogo em 375 e 1280 px, rascunho não público e serviço geral sem reserva). Esses testes usam dados isolados ou respostas simuladas; não validam um fluxo completo na loja remota. No Windows, o utilitário de credenciais de teste agora falha explicitamente: sua proteção `0700/0600` depende de permissões POSIX e não deve ser substituída por uma verificação superficial de ACL.

Roteiro manual após o provisionamento: (1) entrar como proprietário e confirmar a loja, o plano isento e as três fichas em rascunho; (2) criar categorias e itens com dados reais, confirmar que rascunhos não aparecem na vitrine; (3) após revisão e publicação permitida pelo backend, buscar um item em celular e desktop e abrir o detalhe, sem carrinho; (4) publicar horários e regras reais de acompanhamento, reservar com conta de aluno separada e confirmar histórico; (5) testar indisponibilidade, falha de rede, dois alunos no mesmo horário e isolamento de outra loja. Resultado esperado: apenas dados publicados do tenant, erro visível quando a consulta falha, nenhuma cobrança e nenhum horário duplicado.

Para executar no Windows (PowerShell, Node >=22.18): `npm ci`, `npm run dev`, `npm run build`, `npm run smoke`, `npm run test:fitness-pilot-db`, `npm run test:provision`; para UI: `npm --prefix qa ci`, `npm --prefix qa run browser:install`, `npm run test:fitness:ui`. O provisionamento de contas de teste com arquivo criptografado permanece indisponível no Windows até haver uma implementação que verifique ACLs corretamente.

Data da verificação: 27/10/2026. Status: **esquema e função Fitness instalados no Supabase ativo; tenant e conta ainda não provisionados; frontend implementado e validado nesta branch, publicação pendente; não pronto para produção**.

## Identidade e ambiente

- Produto: VendeWeb multissetorial. Segmento público provisório: `Fitness/Academia`.
- Loja solicitada: **FabricioFITNESS**, Linhares/ES. Slug proposto: `fabriciofitness` (a confirmar pelo fluxo oficial no momento da criação).
- Único administrador da loja e Personal Trainer: **Fabricio**, `fabricioroquefitnees@gmail.com`. A mesma conta acumula os dois papéis por autorização expressa. O Admin Master da plataforma permanece separado e não recebe vínculo administrativo com esta loja. Alunos usam contas próprias, vinculadas só ao perfil de cliente.
- Plano solicitado: **Premium** (`PROFESSIONAL`, ID `7f6e380c-aec8-45fc-9692-e25248f2f11f`), maior plano ativo observado no projeto VendeWeb. A assinatura piloto deve ter `billing_amount=0`, sem vencimento e com marcador explícito de isenção. Isso não altera o preço do plano para outras lojas.
- Projeto Supabase ativo: `elttryavkeartoxgdgse`. O projeto antigo Academia/Impulso `vnpoinodvchmmbyxpacj` não foi usado nem alterado. O projeto ativo também atende ao FloriWeb; somente `auth.users` é compartilhado intencionalmente.
- O projeto ativo está `ACTIVE_HEALTHY` e, na listagem de branches Supabase, há apenas `main`; as migrations foram aplicadas nessa branch após revisão de esquema e teste local. Não houve teste prévio em branch Supabase de homologação.
- A migration já existente `20261027135906_food_fitness_access_sandbox.sql` não está aplicada no remoto e pertence ao fluxo de cobrança de alunos do Chat 2. Não executar `supabase db push`; manter cobrança inacessível em produção até a etapa futura.
- O banco antigo da Academia não é fonte obrigatória para o piloto; nenhuma migração de seus dados foi planejada. A loja Fitness deve seguir as regras multiempresa já existentes no VendeWeb.
- Admin Master confirmado na conversa de referência: `contatojoseluizacma@gmail.com`. A grafia diferente citada antes foi esclarecida pelo usuário. Nenhuma conta, papel ou configuração do Admin Master foi alterada. A criação exige sessão dessa conta com MFA/AAL2.
- Consulta remota após implantação: **0** usuários Auth com o e-mail, **0** lojas com o e-mail/slug, plano Premium ativo. As 10 tabelas `food_fitness_*` estão instaladas com RLS e 10 políticas; `food_fitness_pilot_contract()` retorna `true`. Nenhuma loja, convite ou pagamento foi criado.
- O histórico remoto de migrations tem `food_business_segments` como versão `20261024003848`, enquanto o arquivo local correspondente é `20261022215432`. Foram comparadas em leitura as definições remotas de `segment_defaults`, `set_segment`, `public_offers`, `food_platform_seed_new_store` e a restrição de segmento: o conteúdo funcional de base corresponde ao esperado para o acréscimo Fitness. A validação de aplicação e do runtime completo ainda está pendente.

## Implementação local

- `20261027182514_food_fitness_segment_20261027.sql`: segmento `fitness`, módulos `clients`, `appointments`, `training`; seed de loja sem categorias Food nem zonas de entrega; mudança de segmento recusada se já houver produtos ativos.
- `20261027182656_food_fitness_booking_20261027.sql`: profissionais separados de usuários da loja e de alunos; janelas semanais, folgas, políticas publicadas, slots, reservas, cancelamento e reagendamento; travamento transacional por loja/profissional para conflito; histórico e cópia das regras aceitas na reserva. A vitrine só mostra serviços Fitness com preço e regras confirmados.
- `20261027182706_food_fitness_workouts_20261027.sql`: fichas, exercícios e atribuições com `store_id` e RLS. O provisionamento prepara **Básico, Médio e Avançado** como modelos genéricos em rascunho; todos têm exercício, séries, repetições, descanso, carga/esforço, instruções e alternativa. Um profissional ativo deve revisar, ajustar, aprovar e então atribuir a um aluno com conta vinculada.
- `20261027182716_food_fitness_catalog_drafts_20261027.sql`: bloqueia publicação de qualquer produto Fitness até existir fluxo de variantes e estoque confirmado por variante. Produtos de outras lojas seguem a regra atual.
- `20261027182721_food_fitness_pilot_waiver_20261027.sql`: isenção do plano, sem cobrança do piloto, protegida por gatilhos; fornece contrato de prontidão para o provisionamento oficial.
- `food-platform-create-store` atualizado e publicado como versão 18: exige Admin Master com MFA/AAL2, convite, contrato Fitness e plano ativo; cria a loja/assinatura pelo fluxo oficial, define segmento, prepara fichas, vincula proprietário e profissional. Em falha, tenta limpar apenas a loja recém-criada; se a limpeza falhar, bloqueia a loja e expõe o ID para revisão. JWT obrigatório permanece ativo.
- Frontend: criação no Admin Master com opção de isenção; painel `/admin/fitness` para horários, bloqueios, publicação de acompanhamento, revisão/atribuição das fichas; vitrine `/fabriciofitness` para reserva, estados, regras, histórico e fichas do aluno. A loja Fitness não mostra textos de delivery/retirada e não oferece carrinho ou checkout nesta etapa. Respostas e erros vêm das RPCs reais.

## Catálogo e serviços pendentes

Nenhum item abaixo foi criado no projeto remoto; o tenant ainda não existe. Não há dados suficientes para publicação.

| Item | Preparação | Dados faltantes para uso comercial |
| --- | --- | --- |
| Avaliação física | Prevista para cadastro em rascunho, ainda não criada | Descrição aprovada, duração, preço, responsável, regras de cancelamento e reagendamento. Nenhuma informação clínica foi presumida. |
| Acompanhamento de treino | Previsto como serviço `training`, ainda não criado | Duração, preço, descrição aprovada, dias/horários, intervalos, folgas e regras de cancelamento/reagendamento. |
| Whey | Produto físico previsto como rascunho, ainda não criado | Marca, apresentação/variantes, preço, quantidade por variante, descrição e informações do rótulo. Sem alegações de saúde ou resultado. |
| Creatina | Produto físico previsto como rascunho, ainda não criado | Marca, apresentação/variantes, preço, quantidade por variante, descrição e informações do rótulo. Sem alegações de saúde ou resultado. |
| Camisas | Produto físico previsto como rascunho, ainda não criado | Modelos, tamanhos/cores como variantes, preço e quantidade por variante. |

Serviços e fichas não fazem baixa de estoque físico. O estoque Food informado como 6 unidades físicas contra 15 no sistema não foi consultado para este piloto nem ajustado. FKs, RLS e filtros de `store_id` evitam que o estoque de outra loja seja usado no Fitness; isso precisa de prova adicional no ambiente implantado.

Integração futura com Nutrição: o segmento Fitness pode conceder o módulo `nutrition` pelo mecanismo existente de entitlements, quando houver responsável, permissões e fluxo aprovados. O piloto não atribui papel de nutricionista, não registra dados clínicos e não publica serviço nutricional.

## Verificações já feitas

- `npm run typecheck`, `npm run build`, `npm run test:segments`, `npm run smoke` e `npm run test:fitness-pilot-db` passaram localmente. O teste Fitness usa PostgreSQL descartável (PGlite), não grava no projeto remoto.
- O teste de banco descartável cobre papéis distintos, atribuição de fichas somente após aprovação profissional, agenda e conflito de reservas, regras aceitas, cancelamento com histórico, RLS/cross-tenant, bloqueio de produto ativo Fitness, rascunho permitido e cobrança recusada na loja isenta. A execução é sequencial: a trava para solicitações simultâneas foi inspecionada no SQL, mas ainda requer teste paralelo em PostgreSQL real.
- A função Edge passou por verificação de sintaxe TypeScript e foi publicada no projeto ativo como versão 18. Deno não está instalado neste workspace; não houve execução do provisionamento com uma sessão Admin Master AAL2 nesta etapa.
- As cinco migrations foram aplicadas com sucesso no projeto `elttryavkeartoxgdgse`. A consulta posterior confirmou contrato de isenção, restrição de segmento Fitness, RLS e políticas. As advertências de `SECURITY DEFINER` do linter se referem às RPCs intencionalmente expostas, com verificações internas de papel/loja; ainda exigem observação do comportamento real após a primeira loja.
- O projeto remoto foi consultado somente em leitura. Não há tenant ID, perfil profissional, aluno, serviços, fichas, produtos, horários ou convite remotos para verificar ainda.

## Bloqueios e sequência segura

1. Publicar o frontend correspondente a partir da branch limpa `codex/fitness-pilot`. A compilação local passou; publicação do Worker `foodweb` ainda pendente de aprovação. A conta Cloudflare autenticada é a esperada no painel do usuário.
2. Com sessão **Admin Master MFA/AAL2**, chamar a função oficial para criar FabricioFITNESS em Linhares/ES com segmento Fitness, plano Premium isento, proprietário Fabricio e convite por e-mail. O ambiente de execução não tem sessão Auth Master. Não contornar a validação com INSERT administrativo.
3. Registrar IDs retornados; verificar loja, assinatura zerada, `food_business_profiles`, módulos, `food_store_users`, `food_fitness_professionals` e as três fichas ainda em rascunho. O convite oficial é disparado durante o fluxo; validar entrega, Auth/SMTP/Redirect URLs e rollback em falha.
4. Testar com duas contas distintas: proprietário/profissional e aluno. Confirmar recuperação de conta, RLS, horários sem dupla venda concorrente, histórico de cancelamento e ausência de dados de outras lojas. Não usar conta Master nem dados Food como aluno.
5. Solicitar os dados comerciais listados acima. Criar serviços e produtos via interface/RPCs normais; deixar todos os itens sem dados confirmados como rascunho. Sem cobranças reais nesta etapa.

## Contrato técnico para o Chat 2

- **Tenant/loja:** pendente; ID ainda não existe. Slug proposto `fabriciofitness`; projeto Supabase `elttryavkeartoxgdgse`.
- **Papéis:** `food_store_users.role='owner'` para Fabricio, acrescido de `food_fitness_professionals.active=true`; aluno em `food_fitness_students` associado a `food_business_clients`, sem papel em `food_store_users`.
- **Rotas:** `/admin-master/lojas` para provisionar; `/admin/fitness` para operação; `/:storeSlug` para vitrine/agendamento; `/admin/esqueci-senha` e `/admin/redefinir-senha` para recuperação/primeiro acesso.
- **Tabelas principais:** `food_stores`, `food_store_users`, `food_store_subscriptions`, `food_business_profiles`, `food_business_entitlements`, `food_business_services`, `food_business_clients`, `food_business_appointments`, `food_products`, `food_fitness_professionals`, `food_fitness_students`, `food_fitness_windows`, `food_fitness_blocks`, `food_fitness_service_terms`, `food_fitness_booking_terms`, `food_fitness_appointment_events`, `food_fitness_workouts`, `food_fitness_exercises`, `food_fitness_workout_assignments`.
- **RPCs Fitness:** `food_fitness_set_professional`, `food_fitness_save_window`, `food_fitness_disable_window`, `food_fitness_save_block`, `food_fitness_delete_block`, `food_fitness_publish_service`, `food_fitness_list_slots`, `food_fitness_register_student`, `food_fitness_book`, `food_fitness_my_appointments`, `food_fitness_cancel`, `food_fitness_reschedule`, `food_fitness_status`, `food_fitness_seed_workouts`, `food_fitness_save_workout`, `food_fitness_approve_workout`, `food_fitness_assign_workout`, `food_fitness_list_workouts`, `food_fitness_list_students`.
- **Pagamento:** integração de cobrança da reserva e produtos pendente do Chat 2. O plano Premium da loja piloto deve permanecer isento; não criar cobrança de assinatura nem cobrar reserva nesta entrega. Qualquer implementação posterior deve respeitar a cópia das regras aceitas e a guarda de estoque por variante.
