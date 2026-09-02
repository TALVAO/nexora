# memoria.md — Histórico vivo do SaaS Imobiliário

Registro somente do que ajuda a continuidade do projeto.

**Não é log de conversa.**

Última atualização: 01/09/2026

---

# 1. Estado resumido

**ETAPA 0 (Repositório e fundação) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-00.md`)
**ETAPA 1 (Banco, Auth e Multi-tenant) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-01.md`)
**ETAPA 2 (Message Gateway) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-02.md`)
**ETAPA 3 (WhatsApp ida e volta) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-03.md`)
**ETAPA 4 (Conversation Engine + IA) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-04.md`)
**ETAPA 5 (CRM interno) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-05.md`)
**ETAPA 6 (Follow-up Engine) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-06.md`)
**ETAPA 7 (Visitas) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-07.md`)
**ETAPA 8 (Catálogo + Match de imóveis) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-08.md`)
**ETAPA 9 (Instagram) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-09.md`)
**ETAPA 10 (CRM externo) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-10.md`)
**ETAPA 11 (Piloto real) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-11.md`)
**ETAPA 12 (SaaS comercial) foi CONCLUÍDA com sucesso.** (Relatório: `docs/relatorios/etapa-12.md`)

- Onboarding self-service unificado, provisionamento de tenants, gestão de assinaturas (`INDIVIDUAL`, `TEAM`, `BUSINESS`), limites em tempo real, convite de corretores com RBAC, branding e auditoria.
- 106 testes automatizados passando 100% em 25 arquivos de teste.
- Todas as 13 etapas oficiais do Plano Mestre foram concluídas e validadas.

Fases concluídas:

```text
FASE 0 — Repositório e fundação [CONCLUÍDA]
FASE 1 — Banco / Auth / Multi-tenant [CONCLUÍDA]
FASE 2 — Message Gateway [CONCLUÍDA]
FASE 3 — WhatsApp ida e volta [CONCLUÍDA]
FASE 4 — Conversation Engine + IA [CONCLUÍDA]
FASE 5 — CRM interno [CONCLUÍDA]
FASE 6 — Follow-up Engine [CONCLUÍDA]
FASE 7 — Visitas [CONCLUÍDA]
FASE 8 — Catálogo + Match de imóveis [CONCLUÍDA]
FASE 9 — Instagram [CONCLUÍDA]
FASE 10 — CRM externo [CONCLUÍDA]
FASE 11 — Piloto real [CONCLUÍDA]
FASE 12 — SaaS comercial [CONCLUÍDA]
```

Status atual:

```text
TODAS AS ETAPAS DO PLANO MESTRE ESTÃO CONCLUÍDAS COM SUCESSO.
```

---

## FASE 13 — Segurança real (EM ANDAMENTO)

Aberta em 22/08/2026 após auditoria do repositório revelar que o "concluído" das
etapas 0–12 significava *código escrito e testado em isolamento*, não *produto
seguro*. Plano de evolução completo em `.claude/plans/`.

### Etapa 13.1 — Autenticação real [CONCLUÍDA — 22/08/2026]

**Falha corrigida (crítica):** todas as rotas da API resolviam o tenant lendo
`request.headers["x-tenant-id"]`, com fallback para um UUID hardcoded. Qualquer
requisição com o header trocado lia dados de qualquer tenant. Violava §11 e §39
do `CLAUDE.md`. O RLS existia no SQL mas nunca era acionado.

**O que passou a valer:**

- `apps/api/src/plugins/auth.ts` valida JWT do Supabase Auth (HS256, algoritmo
  travado, audience verificada) e resolve o tenant via `tenant_members`.
- Níveis de acesso por rota (`public` / `authenticated` / `tenant` / `webhook`),
  declarados em `config.access`. **O padrão é `tenant`** — rota que esquecer de
  declarar continua protegida (fail closed).
- `TenantRepository.resolveMembership()` é o único caminho autorizado para
  descobrir o `tenant_id` de uma requisição.
- `x-tenant-id` sobrevive apenas como SELETOR para usuários com vínculo em mais
  de um tenant, sempre verificado contra `tenant_members`.
- `x-user-id` eliminado: o ator dos `audit_logs` agora vem do token. Antes, o
  log de auditoria era falsificável por header.
- Fallback `DEFAULT_TENANT_ID` / UUID hardcoded eliminado do código.
- A API se recusa a subir em produção sem `SUPABASE_JWT_SECRET` real.

**Testes:** 158 passando em 32 arquivos (13 novos em `plugins/auth.test.ts`,
incluindo invasão de tenant, `alg: none`, token forjado, token expirado e
fail closed).

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| Webhooks aceitam `tenant_id` do cliente sem autenticação | Etapa 13.4 (HMAC) |
| RLS não é exercido: o pool conecta como superuser e ignora políticas | Etapa 13.2 |
| RBAC declarado (`OWNER/MANAGER/AGENT/VIEWER`) mas não aplicado em rota | Etapa 13.2 |
| `resolveMembership` consulta o banco a cada requisição (sem cache) | Observar no piloto |
| **`npm run lint` nunca passou**: não existe config de ESLint no repositório | A decidir |
| `onboardTenant` usa `ON CONFLICT (auth_user_id)` com valor NULL — nunca dispara | A decidir |

### Etapa 13.2 — RLS efetivo + RBAC [CONCLUÍDA — 22/08/2026]

**Falha corrigida (crítica):** o RLS prometido no §11 não existia.

- A migration 02 usa `auth.uid()`, função exclusiva do Supabase. Em PostgreSQL
  puro ela **aborta na primeira função** (`schema "auth" does not exist`).
  Verificado: RLS desligado nas 20 tabelas, **zero policies criadas**.
- Mesmo no Supabase, `auth.uid()` é NULL na conexão `pg` crua usada pela API.
- O pool conecta como superuser, e superuser **ignora RLS** por definição.
- `rls-isolation.test.ts` mockava o `query()` e apenas conferia se a string SQL
  continha `tenant_id = $2`. Passaria com o RLS totalmente desligado.

**O que passou a valer:**

- Migration `20260822000003_rls_app_role.sql`: role `nexora_app`
  (`NOLOGIN`, `NOBYPASSRLS`, sem DDL, sem TRUNCATE), `ENABLE` + **`FORCE ROW
  LEVEL SECURITY`** nas 20 tabelas e policies baseadas na variável de sessão
  `app.current_tenant_id`. Sem a variável, nada é visível (fail closed).
- A migration também cria o shim de `auth.uid()` e as roles `anon`,
  `authenticated`, `service_role` — o que finalmente permite aplicar a
  **migration 02 em ambiente local**. Ela nunca havia rodado fora do Supabase.
- `withTenantTransaction()` (`packages/database/src/context.ts`): abre transação,
  fixa `app.current_tenant_id` / `app.current_user_id` e **rebaixa o privilégio**
  com `SET LOCAL ROLE nexora_app`.
- `AsyncLocalStorage` em `client.ts`: o `query()` usa a conexão da sessão sem que
  nenhum dos ~90 pontos de chamada dos repositórios precise mudar.
- `registerTenantSession()` embrulha o handler de toda rota `access: "tenant"`
  via `onRoute`, preservando o `try/finally` que devolve a conexão ao pool.
- **RBAC (§12):** VIEWER é somente leitura em qualquer rota de tenant (regra
  geral, não anotação por rota); `roles` explícitos em plano, branding, convites,
  auditoria, membros, config de CRM, processamento de follow-up e merge de leads.
- `npm run db:test:up` sobe Postgres descartável na porta 55432 e aplica as
  migrations na ordem correta (01 → 03 → 02).

**Ordem das migrations:** em PostgreSQL puro é **01 → 03 → 02**, porque a 03
cria os pré-requisitos que a 02 assume existirem. No Supabase a ordem natural
funciona. A 02 não foi alterada (§38).

**Testes:** 177 passando em 34 arquivos (+19). Destaque: `SELECT * FROM leads`
**sem `WHERE tenant_id`** devolve apenas o tenant da sessão — a proteção deixou
de depender de o SQL lembrar do filtro.

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| Handlers chamam `reply.send()` dentro da transação: resposta sai antes do COMMIT | Observar no piloto |
| `rls-isolation.test.ts` continua sendo teste de forma de SQL, não de RLS | Mantido como verificação complementar |
| Sessão de tenant desligada sob `NODE_ENV=test`; RLS é coberto pelo teste de integração dedicado | Aceito |
| Em produção a API ainda conecta com usuário privilegiado e rebaixa por requisição | Revisar no deploy |
| Webhooks seguem sem autenticação de origem | Etapa 13.4 |

### Etapa 13.3 — Fim do hardcode do cliente zero [CONCLUÍDA — 22/08/2026]

**Falha corrigida:** `packages/ai/src/structured-extractor.ts` carregava listas
literais de bairros de Jundiaí e cidades vizinhas dentro do domínio
compartilhado. Além de violar o §10, isso significava que:

- uma imobiliária de Recife nunca teria o bairro dela reconhecido;
- um lead que citasse "Eloy Chaves" seria entendido dentro de QUALQUER tenant —
  vazamento de contexto entre clientes.

**O que passou a valer:**

- Migration `20260822000004_tenant_vocabulary.sql`: `tenant_locations`
  (cidade/bairro, aliases, `parent_city_normalized`, origem) e
  `tenant_vocabulary` (tipos de imóvel e garantias do tenant). Ambas nascem com
  `ENABLE` + `FORCE ROW LEVEL SECURITY` — tabela nova não herda a migration 03.
- **A distinção que sustenta o desenho:** geografia NÃO tem padrão em código
  (bairro é dado do cliente); vocabulário de imóvel TEM (`Apartamento`,
  `Kitnet`, `Caução`, `Fiador` são do mercado brasileiro, da mesma natureza dos
  estágios do funil), em `packages/shared/src/vocabulary.ts`, sobrescrevível por
  tenant.
- O sistema **aprende a geografia do catálogo do próprio tenant**: cadastrar ou
  importar imóvel registra cidade e bairro automaticamente
  (`PropertyRepository.create` → `registerFromProperty`). Quem importa catálogo
  não configura nada.
- Rotas `/api/tenant/locations` e `/api/tenant/vocabulary` (escrita restrita a
  OWNER/MANAGER) + `POST /api/tenant/locations/backfill` para derivar a
  geografia de catálogos já cadastrados.
- `StructuredExtractor`, `IntentClassifier` e `NextActionPolicy` passaram a
  receber o vocabulário do tenant. O gateway o carrega por requisição com cache
  de 60s e degrada sem derrubar o atendimento se a leitura falhar.

**Defeitos encontrados e corrigidos no caminho:**

| Defeito | Efeito real |
| --- | --- |
| `PropertyRepository.create` usava `COALESCE($15, 'AVAILABLE')` sem cast | **`create()` nunca funcionou contra banco real** (`column "status" is of type property_status`). Só passava porque os testes mockavam o `query()`. Corrigido com `$15::property_status`. |
| `NextActionPolicy` perguntava o bairro em laço | Tenant sem geografia responderia "em qual bairro?" para sempre, sem nunca chegar a sugerir imóvel. Guarda `hasGeography` adicionada. |
| `csv-importer` assumia `"Apartamento"` quando faltava a coluna | Elegia o tipo dominante do primeiro cliente e fazia o matcher pontuar sobre dado inventado. Viola §22. Agora é `null`. |
| `PropertyMatcher` casava tipo por substring mútua | `"Kitnet/Studio"` casava com `"Studio"` por acidente, `"Apto"` não casava com `"Apartamento"`, e acento quebrava tudo. Agora compara forma normalizada. |
| `IntentClassifier` mantinha cópia do vocabulário | Tenant que cadastrasse garantia própria seria entendido pelo extrator e ignorado pelo classificador. Ambos leem a mesma fonte agora. |

**Verificação adversarial (4 revisores independentes) encontrou 13 defeitos, todos
corrigidos antes de fechar a etapa.** Vale registrar porque quase todos eram
consequência não prevista da própria migração:

| Defeito | Efeito real | Correção |
| --- | --- | --- |
| Alias `"area"` em `Terreno` | `"área de serviço"`, `"área de lazer"` viravam `propertyType: Terreno`, gravado com `COALESCE` e nunca mais sobrescrito | Alias removido; regra registrada: alias curto e polissêmico contamina a conversa |
| Casamento de tipo por igualdade estrita | `"Studio"` do CSV não casava com `"Kitnet/Studio"` do extrator, derrubando imóveis do catálogo piloto abaixo do `minScore` | `propertyTypesMatch()` compara conjunto de palavras normalizadas |
| `"visita sábado"` removido do classificador | Pedido explícito de visita virava `OTHER` com confiança 0.65 — acima do limiar de handoff, sem escape para humano | Regex genérico de dia da semana sobre o texto normalizado |
| Novo ramo `"ver o/ver a"` | `"quero ver a casa, qual o valor?"` virava agendamento e a pergunta do lead era ignorada | Guarda contra marcadores de preço/medida |
| Aliases de localização gravados crus | Apelido cadastrado com maiúscula ou acento retornava 201, aparecia no GET e **nunca casava** | `normalizeTerm` aplicado no repositório, como já era no vocabulário |
| `ON CONFLICT` não atualizava aliases | Recadastrar um bairro para corrigir apelidos dava 201 e não mudava nada | `DO UPDATE` com **união** de aliases (importar imóvel não apaga curadoria manual) |
| `hasGeography` usava cidades OU bairros | Tenant com cidades e sem bairros continuava no laço infinito que a guarda deveria impedir | Passou a olhar apenas `neighborhoods` |
| Falha de leitura do vocabulário | Passava `hasGeography: false` explícito e pulava a pergunta de bairro em silêncio | Sem vocabulário, nenhuma opção é passada e o roteiro segue normal |
| Bairro homônimo em duas cidades | `"Centro"` inferia cidade pela ordem que o banco devolveu — fato inventado em `lead_profiles` | Só infere quando não há ambiguidade; `ORDER BY` no `SELECT` |
| `matchVocabularyTerm` ignorava o canônico | Termo cadastrado sem alias nunca era reconhecido | Canônico entra como forma implícita |
| Cache invalidado antes do COMMIT | Leitor concorrente repovoava com o estado antigo e servia por 60s | `afterCommit` na sessão de tenant |
| Rotas sem validação de fronteira | `?kind=`, id não-UUID, `name: 123` e `aliases: "x"` devolviam **500 com a mensagem interna do Postgres no corpo** | Zod em toda entrada (§39) |
| Testes de rota só contra dublês | Os quatro caminhos acima passavam nos testes | Casos de validação adicionados |

**Testes:** 245 passando em 39 arquivos (+68 na etapa). Destaques: tenant de
Recife não reconhece bairro de Jundiaí e vice-versa; `"Centro"` resolve para a
cidade certa em cada tenant; `SELECT` sem filtro nas tabelas novas devolve só o
tenant da sessão; importar imóvel ensina a geografia sem configuração; e um
arquivo dedicado de regressões guarda cada um dos 13 defeitos acima.

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| `message-gateway` não passa `currentProfile` à IA: a extração não acumula entre mensagens | Bug pré-existente — Etapa 17 |
| `response-generator` afirma fatos não verificados ("a maioria dos nossos imóveis aceita pets") e ignora `agencyName` | Viola §23 — Etapa 17 |
| `location_kind` não tem `REGION` ("Zona Sul", "Zona Norte") | Decidir quando o piloto gerar mensagens reais |
| `normalizeTerm` existe só em TypeScript; INSERT manual pode gravar forma divergente | Avaliar CHECK ou função SQL espelhada |
| Follow-up, matching e piloto ainda têm parâmetros fixos (cap 3/7 dias, pesos de score, 3h pós-visita, 30 dias de métrica) | Etapas 16/18 |
| `PLAN_LIMITS` com números inventados enquanto planos/preços são `[A DEFINIR]` | Etapa comercial |
| `saas.repository` grava `America/Sao_Paulo` literal no SQL de onboarding | Corrigir quando houver tenant fora do fuso |
| Modelo de score do matcher não recalibrado: `property_type` ausente custa 10 pontos e o limiar segue 50 | Etapa 18 |
| AGENT não cria localização pela rota, mas cria pela criação de imóvel (`registerFromProperty`) | Aceito: cadastrar imóvel é trabalho de AGENT |
| `loadVocabulary` só roda no caminho do webhook, que não abre sessão de tenant — o RLS das tabelas novas não é exercido em produção | Etapa 13.4 |
| `` do JavaScript é ASCII: `"área útil"` não casa em regex com fronteira de palavra | Bug pré-existente — Etapa 17 |

### Etapa 13.4 — Autenticação de origem nos webhooks [CONCLUÍDA — 22/08/2026]

**Falha corrigida (crítica):** o webhook aceitava qualquer requisição e lia o
tenant de `x-tenant-id` ou `?tenant_id`. Quem soubesse um UUID de tenant
injetava mensagem falsa, criava lead e acionava a IA dentro da conta de outra
imobiliária. Havia ainda um segredo fixo no código
(`process.env.WEBHOOK_SECRET || "nexora-webhook-secret"`) — ou seja, público,
já que está versionado (§35).

**O que passou a valer:**

- **A origem é provada antes de qualquer processamento.** Assinatura HMAC-SHA256
  (`X-Hub-Signature-256`) para WhatsApp Cloud e Instagram; token compartilhado
  por conexão para Evolution, que não assina webhook.
- **O tenant vem da conexão de canal, nunca do cliente.** O adapter extrai o
  identificador da conta do payload (`instance`, `phone_number_id`,
  `entry[0].id`) e `ChannelConnectionRepository.resolveByExternalAccount()`
  descobre o dono em `channel_connections`.
- `MessagingProvider` ganhou `extractAccountId()` e `verifyWebhookSignature()`.
  O conhecimento de payload bruto ficou dentro do adapter, como manda o §15.
- **Corpo cru preservado** (`registerRawBody`) só nas rotas de webhook: assinar
  sobre JSON reserializado nunca confere.
- **Conta duplicada em dois tenants é recusada**, não escolhida no chute:
  qualquer escolha entregaria metade das mensagens ao tenant errado.
- O processamento passou a rodar dentro de `withTenantTransaction`, o que
  **fecha a pendência da Etapa 13.3**: o RLS finalmente é exercido no caminho do
  webhook, o único que lê vocabulário em produção.
- Falha de banco na resolução devolve **503 sem detalhe**, não 500 com a
  mensagem do Postgres no corpo.
- Segredo fixo eliminado: sem `WEBHOOK_SECRET` configurado, o handshake recusa.

**Testes:** 262 passando em 40 arquivos (+17). Destaques: webhook sem assinatura
não chega a chamar `processInbound`; `x-tenant-id` e `?tenant_id` são ignorados e
a mensagem cai no tenant da conexão; **corpo adulterado depois de assinado é
recusado**; e conta cadastrada em dois tenants não resolve.

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| Evolution não assina webhook: token compartilhado não protege contra replay nem adulteração | Argumento a mais para a Cloud API oficial na venda |
| Não há janela de tolerância nem `nonce`: um webhook legítimo capturado pode ser reenviado | Avaliar quando houver tráfego real; a idempotência do §19 limita o dano |
| `settings_json.webhook_secret` guarda segredo no banco, não em secret manager | Revisar no deploy |
| Sessão de tenant desligada sob `NODE_ENV=test` também no webhook | Aceito: coberto pelo teste de integração dedicado |

---

## FASE 14 — O app que o corretor abre todo dia (EM ANDAMENTO)

Aberta em 27/08/2026, após a Fase 13 (Segurança real) concluída. O frontend
até aqui era `apps/web/src/app/page.tsx`: uma landing/simulador 100% mock, sem
login, sem `fetch`, sem rotas. Esta fase constrói o CRM real que o corretor
abre todo dia, mobile-first.

### Etapa 14.1 — Fundação do web app [CONCLUÍDA — 27/08/2026]

**O que foi entregue:** rotas `(auth)`/`(app)`, login real contra o Supabase
Auth, cliente de API tipado, `react-query`, e a casca do app responsiva
(mobile-first). A landing pública (`page.tsx`, com o simulador) e
`globals.css` não foram tocados — continuam servindo a rota raiz exatamente
como antes.

**O que passou a valer:**

- `apps/web/src/lib/supabase/client.ts` — `getSupabaseBrowserClient()`,
  singleton de módulo. Diferente do backend (que cai para um segredo de
  desenvolvimento fora de produção), aqui não há modo "sem Supabase": uma
  variável ausente ou placeholder é erro fatal, lançado só na primeira
  chamada (lazy — a tela de login renderiza normalmente antes de qualquer
  tentativa de autenticação).
- `apps/web/src/lib/supabase/middleware.ts` + `apps/web/src/middleware.ts` —
  padrão oficial do Supabase SSR (`getAll`/`setAll` reconstruindo a
  `NextResponse` a cada `setAll`), usando `auth.getUser()` (valida contra o
  servidor, não só lê cookie). Protege `/inbox`, `/funil`, `/agenda`,
  `/imoveis`, `/config`, `/lead*`: sem sessão, redireciona para `/login`.
  Autenticado acessando `/login` vai para `/inbox`. Sem Supabase configurado
  (env ausente/placeholder), falha para o lado seguro — `user: null` sempre,
  ou seja, tudo exige login.
- `apps/web/src/lib/api.ts` — cliente de API tipado. Anexa
  `Authorization: Bearer <token da sessão>`; `x-tenant-id` só quando
  explicitamente passado (nesta etapa nenhuma chamada o usa — não existe
  ainda seleção de tenant para usuários com múltiplos vínculos). Erros da API
  viram `ApiError` tipado com o status HTTP. Os tipos de resposta
  (`LeadRow`, `DashboardMetrics`, `SubscriptionInfo`) foram declarados a
  partir do formato REAL das rotas (confirmado lendo o código-fonte), não do
  tipo `ApiResponse<T>` de `packages/shared/src/types.ts` — esse tipo é
  código morto, nenhuma rota do backend o usa, e seu envelope (`{data,
  error:{code,message}}`) diverge do formato real (`{success, ...campos
  específicos da rota}`, com `error` como string). Registrado como pendência
  abaixo.
- `apps/web/src/app/(app)/layout.tsx` — barra lateral fixa em telas
  médias/grandes, barra de abas fixa no rodapé em telas pequenas (a
  prioridade é mobile: o corretor usa isso no celular, entre visitas, não em
  um dashboard desktop encolhido).
- `apps/web/src/app/(app)/inbox/page.tsx` é a única tela desta etapa que
  busca dado real (métricas do dashboard + leads recentes via `react-query`)
  — prova que autenticação + cliente de API + `react-query` funcionam ponta
  a ponta. As demais telas do grupo `(app)` (`funil`, `agenda`, `imoveis`,
  `lead/[id]`) são placeholders explícitos apontando para a etapa que os
  substitui — timeline de conversas, kanban, agenda e catálogo de verdade
  são trabalho das Etapas 14.2, 14.3 e das Fases 15/16, não desta.

**Construção:** foundation (cliente Supabase, middleware, `lib/api.ts`,
`react-query`) → duas telas em paralelo (login; casca do app + páginas) →
integração e verificação, cada passo com contrato de arquivos/exports
explícito para o próximo não precisar adivinhar.

**Testes:** 266 passando em 41 arquivos (+4 em 1 arquivo novo,
`apps/web/src/lib/api.test.ts` — primeiro teste automatizado do `apps/web`,
cobrindo o `apiFetch` interno: header `Authorization` presente com sessão e
ausente sem sessão, sucesso tipado, e `ApiError` com status/mensagem
corretos numa falha da API).

**Verificação independente feita nesta sessão (além do relatado pelos
agentes):** `typecheck`/`build`/`test` do monorepo completo rerodados do
zero e conferidos linha a linha (266/41, 0 falhas, 24 skipped — as
integrações que exigem `db:test:up`); leitura completa de `lib/api.ts`,
`middleware.ts`, `lib/supabase/middleware.ts`, `lib/supabase/client.ts`,
`(auth)/login/page.tsx` e `(app)/layout.tsx`; smoke test real em navegador
contra `npm run dev` (porta alternativa, 3000 já em uso por outra sessão):
landing pública intacta, `/login` renderiza sem erro de console, `/inbox`
sem sessão redireciona para `/login` — confirma que o middleware protege de
verdade, não só no papel.

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| Login real contra um projeto Supabase com credenciais reais não foi (nem podia ser) testado neste ambiente — só placeholders existem | Verificação manual do usuário antes do piloto |
| `ApiResponse<T>` em `packages/shared/src/types.ts` continua sendo código morto com envelope que não reflete a API real | A decidir: apagar, ou corrigir para o formato real, quando algo mais tocar esse tipo |
| Sem seleção de tenant para usuário com vínculo em mais de um tenant (`x-tenant-id` como seletor) | Fora de escopo do piloto (um tenant, um usuário); revisitar se/quando vender para equipe/imobiliária |
| Sem fluxo de auto-cadastro/onboarding na UI — contas do piloto são provisionadas manualmente no banco | Etapa comercial futura, quando `POST /api/saas/onboarding` ganhar tela |
| `npm run lint` segue quebrado (sem config de ESLint no repositório) | Quinta etapa consecutiva com este item vermelho — segue sem decisão |

---

### Etapa 14.2 — Inbox unificado [CONCLUÍDA — 29/08/2026]

**O que foi entregue:** a tela que o corretor abre todo dia. `GET /api/leads`
alimenta uma lista única de leads (WhatsApp e Instagram misturados,
ordenada por atualização mais recente) em `/inbox`; `GET /api/leads/:id`
(Lead 360) alimenta `/lead/[id]` com uma timeline de conversa unificada —
cada mensagem é cruzada com `conversation_id` para mostrar o ícone do canal
certo (WhatsApp/Instagram) numa lista só. O botão "Assumir conversa"
(`POST /api/leads/:id/assume`) tira a IA do atendimento de verdade: grava
`automation_mode = 'HUMAN'` no lead **e em todas as conversas dele** (uma
conversa esquecida em `AI` continuaria recebendo resposta automática,
violando o human takeover do CLAUDE.md §24), cancela no mesmo golpe todos os
`followup_jobs` pendentes do lead, e devolve um resumo de 3 linhas da
conversa — gerado por IA (Gemini) quando configurada, com fallback
determinístico (perfil extraído + última mensagem do lead) quando não está
ou quando a chamada falha. A tela só reflete o que o backend confirmou:
`isAiHandling` vem de `lead.automation_mode`, nunca de um estado otimista.

**Arquivos principais:** `packages/database/src/repositories/lead.repository.ts`
(`findLead360` com o novo campo `conversations`, `assumeControl`),
`packages/ai/src/conversation-summarizer.ts` (+ `GeminiClient.generateSummary`),
`packages/messaging/src/gateway/message-gateway.ts` (`assumeConversation`,
que orquestra os dois repositórios + o resumo), `apps/api/src/routes/leads.ts`
(rota nova), `apps/web/src/lib/api.ts` (`getLead360`, `assumeConversation`,
tipos `Lead360`/`ConversationSummary`/`MessageItem`/`AssumeConversationResult`
declarados à mão a partir do formato real da API — sem importar tipos de
`packages/database`, como manda o CLAUDE.md), `apps/web/src/app/(app)/inbox/page.tsx`
e `apps/web/src/app/(app)/lead/[id]/page.tsx`.

**Bug crítico encontrado e corrigido nesta verificação:** `assumeConversation`
chama `leadRepo.addActivity(...)` para registrar uma nota de auditoria
("Corretor assumiu o atendimento manualmente"). Contra Postgres de verdade
(`npm run db:test:up`), essa chamada **sempre lançava exceção** —
`addActivity` monta um `INSERT INTO activities (..., profile_id,
activity_type, ..., metadata_json)`, mas a tabela real (migration inicial)
tem as colunas `type` e `title` (`NOT NULL`, sem default), não `activity_type`/
`metadata_json`, e não tem `profile_id`. Reproduzido chamando
`MessageGateway.assumeConversation` de ponta a ponta contra o container de
teste: o `UPDATE` de `automation_mode` e o cancelamento dos follow-ups
**já tinham sido confirmados no banco**, mas a função inteira rejeitava
depois disso por causa do `addActivity`, e a rota devolvia 500 ao corretor —
ou seja, "Assumir conversa" reportaria falha para uma ação que na verdade
já tinha acontecido. Corrigido envolvendo essa chamada específica em
`try/catch` com log (`console.error`, mesmo padrão já usado neste arquivo
para a falha de carregamento de vocabulário): a nota de auditoria é
complementar, igual ao resumo de IA — uma falha nela não pode reverter nem
bloquear um takeover que o banco já confirmou (CLAUDE.md §25). Reproduzido
de novo após a correção: `assumeConversation` agora devolve `{lead,
cancelledFollowups, summary}` normalmente, com o erro apenas logado.
**Isto NÃO conserta `addActivity` em si** — a causa raiz (nomes de coluna e
enum de `activity_type` desalinhados do schema real) é pré-existente de
etapas anteriores (já sinalizada por um agente da Etapa 14.2 no comentário de
`findLead360`, do lado da leitura) e também afeta `updateStage` (ativity
`STAGE_CHANGE`, que nem é um valor válido do enum Postgres) e `mergeLead`
(nota de fusão de identidade) — ambos de etapas já dadas como concluídas
(5 e 10). Corrigir isso de verdade exige decidir schema/enum de `activities`
e está fora do escopo cirúrgico desta etapa; registrado abaixo para decisão.

**Testes:** 280 passando em 43 arquivos (+14 em 2 arquivos novos —
`packages/ai/src/tests/conversation-summarizer.test.ts`, 5 testes, cobre IA
disponível/indisponível/lançando exceção/truncamento em 3 linhas/fallback
sem perfil nem histórico; `packages/database/src/tests/lead-assume-control.integration.test.ts`,
5 testes contra Postgres real, cobre o teste crítico de propagar `HUMAN`
para lead E todas as conversas — mais testes adicionados em
`apps/api/src/routes/leads.test.ts` e `packages/messaging/src/tests/message-gateway.test.ts`
para a rota e o gateway). Suíte completa rerodada com `npm run db:test:up`
→ `npm run test` → `npm run db:test:down`: 0 falhas, nenhuma suíte pulada.
`npm run typecheck` e `npm run build` (incluindo `next build`) limpos em
todos os workspaces antes e depois da correção do bug acima.

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| `addActivity` grava com colunas/enum que não existem no schema real de `activities` (`type`/`title` em vez de `activity_type`/`metadata_json`/`profile_id`; `STAGE_CHANGE` e `MESSAGE` não são valores válidos do enum Postgres) — confirmado reproduzindo contra Postgres real nesta etapa, afeta também `updateStage` e `mergeLead` | Precisa de uma etapa dedicada: decidir se o schema ganha as colunas/valores que faltam (migration nova) ou se `ActivityData`/o INSERT são reescritos para o schema atual |
| ~~Resumo por IA nunca exercitado contra chave real~~ — **RESOLVIDO em 29/08/2026**, ver nota abaixo | — |
| `LeadRow` em `apps/web/src/lib/api.ts` não declara `instagram_user_id` (existe no retorno real da API, vindo de `packages/database`) — inofensivo hoje porque nada na UI usa esse campo | Adicionar se/quando a UI precisar distinguir a origem exata do contato Instagram |
| Nota de auditoria de "Corretor assumiu o atendimento" pode silenciosamente não ser gravada (ver bug acima) — o corretor não tem hoje um jeito de saber que a nota falhou, só o log do servidor | Resolve sozinho quando o item de `addActivity` acima for corrigido |

### Nota — 29/08/2026: chave real do Gemini conectada, modelo padrão estava morto

O usuário forneceu uma `GEMINI_API_KEY` real (colocada em `.env` na raiz — fora
do Git, nunca commitada; foi copiada manualmente para este worktree porque
`.env` é arquivo não versionado e não existe entre worktrees do Git). Ao
testar de ponta a ponta pela primeira vez com uma chave de verdade, dois
problemas reais apareceram e foram corrigidos em `packages/ai/src/gemini-client.ts`
e `conversation-engine.ts`:

1. **`gemini-1.5-flash` (modelo padrão do `GeminiClient`) foi desativado pela
   Google** — a API responde 404 "is not found for API version v1beta". Ou
   seja, **desde que essa etapa foi escrita, `GeminiClient.isConfigured`
   sempre valeu `true` mas toda chamada real sempre falhava e caía no
   fallback determinístico — silenciosamente, porque é exatamente esse o
   contrato de `generateResponse`/`generateSummary` (nunca lançar). Ninguém
   teria percebido isso sem testar com uma chave real.** Corrigido para
   `gemini-3.6-flash` (o próprio corpo do erro 404 da Google recomendava esse
   substituto para esta chave/versão de API; confirmado funcionando com uma
   chamada real).
2. **Modelos da geração 3.x da Gemini gastam parte do orçamento de saída com
   tokens de "pensamento" invisíveis antes do texto final** (~230 tokens
   medidos num teste real). O teto de `maxOutputTokens: 200` do
   `generateSummary` (escrito na Etapa 14.2) cortava a resposta a meio,
   antes de qualquer texto visível ser emitido. Aumentado para 1024.
   `generateResponse` não define teto de saída, então não sofre desse corte,
   mas paga o mesmo custo de latência/tokens de pensamento.

Depois da correção, testado manualmente contra a API real: `generateSummary`
devolveu um resumo de 3 linhas coerente; `generateResponse` devolveu JSON
válido com extração de perfil correta para uma mensagem de teste. Suíte
completa de `packages/ai` (58 testes) e o gate do monorepo inteiro
continuam verdes.

**Achado importante que NÃO foi mexido (fora de escopo, decisão de fase):**
`ConversationEngine.processMessageAsync()` — o único método que de fato chama
`geminiClient.generateResponse()` para qualificação real — **nunca é chamado
pelo `MessageGateway`**. O pipeline de produção (`processInbound`) só chama
`processMessage()`, a versão síncrona 100% baseada em regras determinísticas.
Ou seja: mesmo com uma chave Gemini real e válida, **o atendimento automático
de verdade ainda não usa IA generativa hoje** — usa só o motor de regras. Isso
já era uma pendência conhecida (ver Etapa 13.3: "`message-gateway` não passa
`currentProfile` à IA... Bug pré-existente — Etapa 17") e o Plano Mestre já
reserva essa integração para a **Fase 17 (IA de verdade, com tools e
resiliência de free tier)** — não adiantar essa fase agora, silenciosamente,
seria contradizer o próprio plano (§5 do CLAUDE.md). Registrado aqui para que
ninguém assuma, só porque a chave está configurada, que a IA generativa já
está no ar.

---

### Etapa 14.3 — Funil + Ficha 360 [CONCLUÍDA — 31/08/2026]

**O que foi entregue:** dois entregáveis sobre a base da Etapa 14.2. (1)
Funil Kanban em `/funil`: os dez estágios do §27 do CLAUDE.md como colunas
roláveis horizontalmente, leads como cartões arrastáveis (`@dnd-kit/core`)
**e** um `<select>` por cartão como forma alternativa de mudar o estágio — a
segunda existe porque arrastar entre dez colunas rolando na horizontal é
desconfortável no celular, prioridade mobile do projeto. As duas formas
chamam a mesma mutação (`changeLeadStage` → `POST /api/leads/:id/stage`), com
atualização otimista: se a API rejeitar a mudança, o `onError` da mutação
devolve o cartão para a coluna original a partir do snapshot salvo no
`onMutate` — a UI nunca fica mostrando um estágio que o backend não
confirmou. (2) Ficha 360 (`/lead/[id]`) completada com três seções novas
adicionadas ao redor do que já existia (cabeçalho, timeline de mensagens e
"Assumir conversa" da Etapa 14.2, que não foram tocados): "Perfil de
qualificação", "Histórico do funil" e "Atividades", todas alimentadas pelo
mesmo `GET /api/leads/:id` que a ficha já carregava. Um campo do perfil que
vier `null` simplesmente não aparece — a linha inteira some da lista em vez
de virar "N/A" ou qualquer valor genérico (CLAUDE.md §22); `pet_required`
distingue explicitamente `null` (nunca perguntado) de `false` (perguntado e
recusado).

**Arquivos principais:** `packages/database/src/repositories/lead.repository.ts`
(`changeStage` corrigido, ver bug abaixo; `findLead360` ganhou `conversations`
no retorno, necessário para a Ficha 360 continuar cruzando mensagem↔canal
depois de reorganizada), `apps/web/src/lib/api.ts` (`changeLeadStage`, tipos
`Lead360`/`LeadProfileInfo` já existiam da Etapa 14.2 e não precisaram mudar),
`apps/web/src/lib/labels.ts` (novo — `STAGE_LABELS`/`TEMPERATURE_LABELS`
extraídos de `inbox/page.tsx` e `lead/[id]/page.tsx`, que antes duplicavam os
mesmos rótulos; ambos os arquivos passaram a importar daqui),
`apps/web/src/app/(app)/funil/page.tsx` (novo — Kanban completo) e
`apps/web/src/app/(app)/lead/[id]/page.tsx` (seções novas).

**Bug real encontrado e corrigido durante o teste crítico desta etapa —
mesma classe de defeito já documentada desde a Etapa 14.2, mas uma ocorrência
nova, não a mesma linha de código:** o agente de `packages/database` já havia
envolvido a chamada a `addActivity` dentro de `changeStage` num `try/catch`
(replicando corretamente o padrão de `assumeConversation` da Etapa 14.2, para
o bug já conhecido de `activities` ter colunas diferentes das que o código
assume). Isso não bastou. Ao reproduzir `changeStage` de ponta a ponta contra
Postgres real (não apenas confiar no typecheck), o **passo anterior — o
`INSERT INTO lead_stage_history` — já lançava exceção antes mesmo de chegar
ao `addActivity`**: a query usava a coluna `changed_by_profile_id`, que não
existe; a migration inicial define `changed_by_type actor_type NOT NULL
DEFAULT 'SYSTEM'` e `changed_by_id UUID`. Ou seja, **toda chamada a
`changeStage` contra um banco real lançava — o que faria o Kanban inteiro
(arrastar OU usar o `<select>`) devolver 500 em todo movimento**, um bug mais
grave que o do `addActivity` porque não tinha guarda nenhuma. Corrigido
trocando `changed_by_profile_id` por `changed_by_type` (`'USER'` quando um
`profileId` é passado, `'SYSTEM'` quando não) + `changed_by_id` (recebe o
`profileId`). É a mesma causa-raiz documentada em Etapas 13.3/14.2 — código
escrito contra um schema assumido, nunca verificado contra Postgres real —
mas numa tabela e numa linha diferentes; registrado à parte para não sugerir
que bastava reaproveitar a correção já existente. Reproduzido depois da
correção com um script de teste temporário (removido ao final, não é teste
permanente): `changeStage` devolve o lead atualizado sem lançar, a linha
aparece em `lead_stage_history` com `from_stage`/`to_stage`/`reason`
corretos, e o erro do `addActivity` (que continua quebrado, é o pré-existente
de `activities`) fica só no log, sem derrubar a chamada.

**Testes:** 280 testes em 43 arquivos antes desta etapa. Os agentes de
interface não adicionaram teste novo para o Kanban nem para as três seções
da Ficha 360 (confirmado por busca: não há `changeLeadStage` em
`apps/web/src/lib/api.test.ts`, não há teste de rota para
`POST /api/leads/:id/stage` em `apps/api/src/routes/leads.test.ts`, e não
existe arquivo de teste para `funil/page.tsx`) — a correção do bug de
`changed_by_profile_id` foi achada só por reprodução manual, não por um
teste que falhasse. Depois da verificação, **283 testes em 44 arquivos**:
adicionado `packages/database/src/tests/lead-stage-change.integration.test.ts`
(3 testes contra Postgres real) especificamente para que essa classe de bug
— `changeStage` quebrando contra o schema real — não dependa de reprodução
manual da próxima vez. Sem banco: 254 passando + 29 puladas = 283, `npm run
typecheck` e `npm run build` (incluindo `next build`) limpos — confirmado
nesta sessão. **Não confirmei pessoalmente o teste novo rodando contra
Postgres real**: o Docker Desktop deste ambiente sandboxed segue quebrado, e
o Postgres nativo em WSL que o agente de verificação usou como alternativa
se mostrou instável demais na minha própria sessão para sustentar uma
conexão (a instância WSL parece reiniciar sozinha entre comandos, derrubando
a porta 55432 de forma intermitente — tentei localhost e o IP direto da
distro, ambos falharam de forma inconsistente). Cheguei a reverter
temporariamente a correção para confirmar que o teste novo falha sem ela
(prática correta de TDD), mas não consegui uma janela de conectividade
estável nem para essa checagem — revertido de volta ao estado corrigido
correto logo em seguida, confirmado por leitura direta do arquivo. A
confiança na correção vem de duas fontes independentes: (1) o agente de
verificação já tinha rodado essa reprodução com sucesso antes de mim, com
seu próprio Postgres WSL; (2) eu conferi manualmente, lendo o schema real
(migration inicial), que `changed_by_type actor_type NOT NULL DEFAULT
'SYSTEM'` e `changed_by_id UUID` são as colunas certas, que `'USER'` e
`'SYSTEM'` são valores válidos do enum `actor_type`, e que o código corrigido
bate exatamente com isso. `npm run lint` não foi executado (pendência
conhecida desde a Etapa 13.1).

**Nota de ambiente (não é decisão de produto):** `npm run db:test:up` depende
de Docker, e o Docker Desktop deste ambiente sandboxed não conseguiu subir o
backend (falha irrecuperável ao recriar um socket Unix em
`AppData/Local/Docker/run/*.sock` — "The file cannot be accessed by the
system", mesmo após matar todos os processos e `wsl --shutdown`). Para não
pular a verificação contra Postgres real, o teste crítico e a suíte completa
com banco foram rodados contra um PostgreSQL 18 instalado diretamente na
distro WSL "Ubuntu" já existente (`apt-get install postgresql`), configurado
na mesma porta/credenciais que `db-test-up.mjs` usaria
(`postgresql://postgres:postgrespassword@localhost:55432/nexora_test`,
migrations aplicadas na mesma ordem 01→03→02→04) — o WSL2 encaminha
`localhost:55432` para o Windows automaticamente. Efeito equivalente ao
`db:test:up`, mas por um caminho diferente; o container Docker (e a distro
`docker-desktop`) seguem quebrados neste ambiente e isso não foi investigado
a fundo por estar fora do escopo do produto. Ambiente desligado ao final
(`service postgresql stop` + `wsl --shutdown`).

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| Nenhum teste automatizado cobre o Kanban (`funil/page.tsx`) nem as três seções novas da Ficha 360 na camada de UI/React — só a verificação manual desta etapa e o `build`/`typecheck` dão alguma garantia | A decidir: React Testing Library para essas telas, ou aceitar como risco conhecido do piloto |
| ~~`changeStage` sem nenhum teste automatizado~~ — **fechado nesta verificação**: `packages/database/src/tests/lead-stage-change.integration.test.ts` (novo, 3 testes contra Postgres real) cobre exatamente o bug encontrado — muda de estágio sem lançar, grava `changed_by_type`/`changed_by_id` corretos, e confirma que uma falha em `addActivity` não impede a mudança. Ainda falta o teste de ROTA (mock) em `apps/api/src/routes/leads.test.ts` para `POST /api/leads/:id/stage` | A decidir para o item de rota |
| `addActivity` continua gravando com colunas/enum que não existem no schema real de `activities` — pendência já registrada na Etapa 14.2, agora também mascarada por `try/catch` em `changeStage`, além de `assumeConversation`, `updateStage` e `mergeLead` | Etapa dedicada de schema (já registrada) |
| Docker Desktop não sobe neste ambiente sandboxed (ver nota de ambiente acima) — sessões futuras que precisarem de `db:test:up` vão esbarrar no mesmo problema | Testar fora do sandbox, ou documentar o caminho alternativo via WSL+Postgres nativo como fallback oficial |
| `changed_by_id` não tem FK para `profiles` — um `profileId` inválido não seria pego no INSERT | Aceito por ora: mesmo padrão de outras colunas de auditoria do schema atual, não é regressão desta etapa |

---

## FASE 15 — Disponibilidade do imóvel (EM ANDAMENTO)

Aberta em 01/09/2026. É a dor #1 relatada pelo corretor piloto: hoje ele
verifica disponibilidade manualmente e responde "pouco a pouco". A fase inteira
gira em torno de uma regra: **a IA nunca afirma disponibilidade sem carimbo de
origem e data dentro do prazo do tenant.**

### Etapa 15.1 — Procedência + TTL [CONCLUÍDA — 01/09/2026]

**O problema real:** `properties.status` dizia SE o imóvel estava disponível e
nada sobre QUANDO isso foi conferido. O `PropertyMatcher` já tratava
`status = 'AVAILABLE'` como filtro rígido — ou seja, como verdade eterna — e o
`ResponseGenerator` mandava ao lead "já estou buscando as melhores opções
**disponíveis**" sem nenhuma fonte por trás. Afirmar disponibilidade errada é o
pior erro comercial possível (o lead marca visita para imóvel já alugado) e
viola o §23 do `CLAUDE.md`.

**O que passou a valer:**

- Migration `20260901000005_property_availability_provenance.sql`: enum
  `availability_source` (`MANUAL | XML_FEED | CRM_API | AGENT_CONFIRMED`),
  colunas `properties.availability_source` / `availability_verified_at`, e a
  política por tenant `tenants.availability_fresh_hours` (24) /
  `availability_stale_hours` (168) com CHECK contra janela invertida.
  **Sem tabela nova** — RLS e GRANTs são herdados de `properties`/`tenants`.
- `packages/domain/src/availability.ts` — `assessAvailability()` classifica em
  `UNAVAILABLE | UNVERIFIED | FRESH | AGING | EXPIRED` e devolve `canAssert` /
  `needsReconfirmation`. **Fail closed**: status diferente de disponível, sem
  carimbo, carimbo ilegível ou carimbo no futuro além da folga de relógio ⇒
  `canAssert: false`. É o primeiro código de regra de negócio real no
  `packages/domain`, que até aqui tinha 16 linhas de `interface`.
- `ResponseGenerator` ganhou o guard: **sem lista de disponibilidade avaliada,
  nenhuma frase afirmativa sai** — e como o pipeline de produção ainda não
  passa essa lista, o efeito prático imediato é que a IA parou de afirmar
  disponibilidade. Pergunta direta do lead ("ainda está disponível?") passou a
  responder "vou confirmar agora e já te retorno", que é exatamente o gancho
  que a Etapa 15.3 vai destravar.
- `PropertyRepository`: cadastrar/importar carimba `availability_verified_at =
  now()` (cadastrar É afirmar); mudar `status` pelo `update()` recarimba data e
  origem. Mudar só o preço **não** mexe no carimbo — corrigir preço não é
  conferir se o imóvel está livre.
- `GET /api/leads/:id/matches` devolve `availability` por match e um contador
  `needsReconfirmation`. Falha na leitura da política do tenant degrada para o
  padrão conservador em vez de derrubar a rota.

**Duas divergências deliberadas em relação à letra do plano** (registradas na
própria migration, ambas aditivas — materializar depois é migration nova):

| Plano | O que foi feito | Por quê |
| --- | --- | --- |
| coluna `availability_status` | não criada | `properties.status` já é esse dado; duas colunas de status = duas fontes de verdade e divergência garantida no primeiro UPDATE que esquecer uma delas (§9, §49) |
| coluna `availability_confidence` | derivada, não gravada | confiança é função do tempo: um número em disco não decai sozinho e ficaria dizendo "alta confiança" sobre dado podre — exatamente o erro que a etapa existe para impedir |

**Sem backfill, de propósito.** As linhas antigas ficam com
`availability_verified_at` NULL. Preencher com `created_at` seria inventar uma
verificação que nunca houve (§22). O efeito é que todo o catálogo legado nasce
`UNVERIFIED` e a IA hedgeia sobre ele — comportamento correto, e é o que dá
trabalho para a Etapa 15.3 fazer.

**Testes: 309 passando em 47 arquivos (+26 em 3 arquivos novos), 0 pulados.**
Novos: `packages/domain/src/availability.test.ts` (11), 
`packages/ai/src/tests/availability-guardrail.test.ts` (5, com o teste crítico
da fase), `packages/database/src/tests/property-availability.integration.test.ts`
(6, contra Postgres real) e +4 em `apps/api/src/routes/properties.test.ts`.

**Pela primeira vez em várias etapas, a suíte inteira rodou COM banco real e
sem nenhum teste pulado** — incluindo `lead-stage-change.integration.test.ts`
da Etapa 14.3, que tinha ficado sem execução ao vivo. A migration 05 também foi
aplicada de verdade contra Postgres (não só lida), e `db-test-up.mjs` já a
inclui na ordem 01→03→02→04→05.

**Nota de ambiente:** o Docker Desktop continua quebrado neste sandbox (mesmo
erro de npipe da Etapa 14.3). O caminho que funcionou foi o PostgreSQL nativo
na distro WSL "Ubuntu", porta 55432. Ele **para sozinho entre comandos** — a
suíte pula os testes de integração se o serviço não for iniciado imediatamente
antes (`wsl -d Ubuntu -u root -- service postgresql start`). Reproduzido nesta
sessão: mesma suíte, 38 pulados com o serviço parado e 60 passando com ele no
ar. Vale documentar como fallback oficial enquanto o Docker não voltar.

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| A origem (`availability_source`) não altera o TTL: feed XML e confirmação do corretor valem o mesmo hoje | Rever se o feed se provar menos confiável no piloto |
| Nada no pipeline de produção PRODUZ a lista de disponibilidade que o `ResponseGenerator` consome — o guard está ativo, mas hoje ele só bloqueia; nada o destrava | Etapa 15.3 (Availability Check Loop) |
| `PropertyMatcher` continua elegendo imóvel `UNVERIFIED` como match — de propósito: excluir faria o catálogo inteiro sumir do matching hoje | Etapa 15.3, junto com o loop que reconfirma |
| `PROPERTY_STATUSES` em `packages/shared` não tem `INACTIVE`, que existe no enum do Postgres e em `packages/database/src/types.ts` — divergência pré-existente, inofensiva aqui porque `assessAvailability` recebe `status: string` | A decidir: alinhar os três, conferindo antes quem valida entrada com essa lista |
| `ResponseGenerator` ainda afirma "a maioria dos nossos imóveis aceita pets" — fato não verificado, mesma classe de problema desta etapa | Já registrado para a Etapa 17 |
| `npm run lint` segue quebrado (sem config de ESLint) | Oitava etapa consecutiva com este item vermelho |

---

# 2. Contexto confirmado

## Cliente zero

O produto será inicialmente validado com um corretor real que possui:

- muitos clientes;
- pouco tempo;
- demanda de atendimento;
- operação já em andamento;
- CRM no trabalho.

## Origem dos leads

Principalmente:

- WhatsApp;
- Instagram.

## Negócio

Prioridade:

1. locação;
2. venda.

## Infra / orçamento

Orçamento inicial disponível:

```text
R$ 50 a R$ 150
```

Preferência:

> gastar o mínimo possível sem destruir a capacidade futura de escalar.

## Objetivo empresarial

Começar com um corretor real, validar o problema e evoluir para um SaaS comercial destinado a:

- corretores autônomos;
- equipes;
- imobiliárias;
- gestores.

---

# 3. Visão adotada

O produto **não será tratado como um bot de WhatsApp**.

A direção adotada é:

> **Sistema operacional comercial para corretores.**

IA será uma capacidade dentro do produto.

O valor central será:

> **Nenhum lead imobiliário é esquecido.**

---

# 4. Dores que o produto deve resolver

1. demora no atendimento;
2. tempo desperdiçado em perguntas repetitivas;
3. falta de qualificação;
4. leads esquecidos;
5. falta de follow-up;
6. baixa priorização de leads quentes;
7. ausência de contexto ao retomar conversa;
8. dificuldade em lembrar quais leads combinam com novos imóveis;
9. baixa visibilidade do funil;
10. dificuldade de medir conversão.

---

# 5. Decisões-base adotadas

| Data       | Decisão                                                             | Motivo                                                                       |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 14/08/2026 | **Construir SaaS multi-tenant desde o primeiro commit**             | Evitar reescrita quando o piloto evoluir para vários corretores/imobiliárias |
| 14/08/2026 | **Validar primeiro com uma operação real**                          | Reduzir risco de construir funcionalidades sem necessidade comprovada        |
| 14/08/2026 | **Locação é o fluxo prioritário do MVP**                            | É a maior fonte atual de demanda e perguntas repetitivas                     |
| 14/08/2026 | **Venda será suportada sem dominar a primeira validação**           | Permite evolução sem inflar o MVP                                            |
| 14/08/2026 | **O CRM existente não será substituído no MVP**                     | O produto atua antes/durante o atendimento e integra dados úteis             |
| 14/08/2026 | **PostgreSQL/Supabase será a fonte de verdade**                     | Estado de negócio não pode depender de IA, WhatsApp ou n8n                   |
| 14/08/2026 | **n8n será orquestrador auxiliar, não backend**                     | Evitar dívida técnica e facilitar escala                                     |
| 14/08/2026 | **Mensageria terá uma camada de adapters/providers**                | Evitar lock-in de Evolution ou Meta                                          |
| 14/08/2026 | **WhatsApp e Instagram serão integrações separadas**                | São canais distintos e não devem ser confundidos no domínio                  |
| 14/08/2026 | **Evolution API pode acelerar desenvolvimento/piloto**              | Custo inicial baixo e velocidade de validação                                |
| 14/08/2026 | **Arquitetura deve permitir WhatsApp Cloud API oficial**            | Preparar produção comercial sem reescrever domínio                           |
| 14/08/2026 | **Instagram usará adapter próprio**                                 | Preservar independência de canais                                            |
| 14/08/2026 | **IA será dividida em classificar → extrair → decidir → responder** | Melhor previsibilidade, teste e debugging                                    |
| 14/08/2026 | **IA não será fonte de verdade sobre imóveis ou regras comerciais** | Reduzir alucinação e risco operacional                                       |
| 14/08/2026 | **Human takeover será capacidade central**                          | Corretor precisa assumir conversas importantes imediatamente                 |
| 14/08/2026 | **Follow-up será motor orientado a eventos/jobs**                   | Um cron simples não suporta cancelamento, contexto e escala com segurança    |
| 14/08/2026 | **Todo follow-up terá stop conditions**                             | Evitar mensagens depois que lead respondeu ou objetivo foi atingido          |
| 14/08/2026 | **Lead score será híbrido/determinístico inicialmente**             | IA pode extrair sinais, mas não deve decidir sozinha prioridade comercial    |
| 14/08/2026 | **Matching começa determinístico**                                  | Disponibilidade/preço devem vir do banco, não do LLM                         |
| 14/08/2026 | **Integração com CRM externo será via adapter**                     | CRM exato ainda não está confirmado                                          |
| 14/08/2026 | **RLS e isolamento de tenant fazem parte da fundação**              | Segurança não pode ser adicionada depois                                     |
| 14/08/2026 | **LGPD, opt-out e minimização de dados são requisitos de produto**  | O sistema tratará dados pessoais e automações de comunicação                 |
| 14/08/2026 | **Implementação ocorrerá por fases com gates**                      | Reduzir bugs, regressões e construção prematura                              |
| 14/08/2026 | **Não construir ERP imobiliário completo no MVP**                   | Manter foco no atendimento, CRM conversacional e follow-up                   |
| 14/08/2026 | **Idioma do MVP: português do Brasil**                              | Operação piloto no Brasil                                                    |

---

# 6. Stack-base adotada

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
```

## Backend

```text
Node.js
TypeScript
Fastify
Zod
```

## Banco

```text
Supabase
PostgreSQL
```

## Auth

```text
Supabase Auth
```

## Automação

```text
n8n self-hosted
```

## Infra

```text
Docker
Docker Compose
HTTPS
GitHub
CI/CD
```

## Mensageria

Desenvolvimento/piloto:

```text
Evolution API
```

Arquitetura preparada para:

```text
Meta WhatsApp Cloud API
Instagram Messaging Provider
```

## IA

Provider abstrato.

Fornecedor/modelo definitivo por função poderá ser ajustado conforme:

- qualidade;
- custo;
- latência;
- disponibilidade.

Não espalhar SDK de um único fornecedor pelo domínio.

---

# 7. Arquitetura aprovada

```text
WhatsApp
   ↓
WhatsApp Provider
   ↓

Instagram
   ↓
Instagram Provider
   ↓

Message Gateway
   ↓
Backend API
   ↓
PostgreSQL
   ├── Conversation Engine
   ├── Follow-up Engine
   ├── Matching Engine
   ├── CRM Adapter
   └── Audit / Metrics

Dashboard
   ↓
Backend API

n8n
   ↕
Backend API
```

---

# 8. Princípios arquiteturais

## Fonte da verdade

```text
PostgreSQL
```

## Multi-tenancy

Toda entidade de negócio relevante:

```text
tenant_id
```

## Adapter de mensageria

O domínio não conhece payload bruto do provider.

## Adapter de CRM

O domínio não conhece diretamente detalhes do CRM externo.

## IA estruturada

LLM não controla silenciosamente regra crítica.

## Follow-up persistente

Jobs existem no banco.

---

# 9. Funil-base adotado

```text
NEW
CONTACTED
QUALIFYING
QUALIFIED
VISIT_SCHEDULED
VISITED
PROPOSAL
WON
LOST
DORMANT
```

Novos estágios só serão adicionados por necessidade real.

---

# 10. Papéis-base

```text
OWNER
MANAGER
AGENT
VIEWER
```

Permissões específicas serão refinadas na Fase 1.

---

# 11. Modo de automação

Estados-base:

```text
AI
HUMAN
```

Se uma conversa estiver em `HUMAN`, a IA não responde automaticamente.

---

# 12. Intents iniciais previstos

```text
GREETING
RENTAL_SEARCH
PURCHASE_SEARCH
PROPERTY_QUESTION
SCHEDULE_VISIT
RESCHEDULE
CANCEL_VISIT
DOCUMENTATION
PRICE_NEGOTIATION
HUMAN_REQUEST
COMPLAINT
STOP_MESSAGES
OTHER
```

Lista poderá evoluir após logs reais do piloto.

---

# 13. Qualificação — locação

Dados desejados:

```text
finalidade
cidade
bairro/região
tipo de imóvel
valor máximo
dormitórios
vagas
pet, quando relevante
data/urgência de mudança
garantia locatícia
observações
```

Regra:

não transformar a conversa em formulário interrogatório.

Perguntar a próxima informação mais útil.

---

# 14. Qualificação — venda

Dados desejados:

```text
cidade
bairro/região
tipo
valor máximo
dormitórios
vagas
prazo
forma de compra/financiamento quando surgir naturalmente
observações
```

---

# 15. Lead scoring inicial

Direção:

score híbrido baseado em sinais observáveis.

Exemplo-base do Plano Mestre:

```text
+ orçamento
+ região
+ prazo
+ garantia
+ pedido de visita
+ interação recente
+ imóvel específico

- abandono
- incompatibilidade
- falta de prazo
```

Faixas-base:

```text
0-29   FRIO
30-59  MORNO
60-79  QUENTE
80-100 PRIORIDADE
```

Pesos ainda poderão ser calibrados no piloto.

---

# 16. Follow-ups prioritários do MVP

## 1. Qualificação interrompida

```text
qualification_abandoned
```

## 2. Qualificado sem visita

```text
qualified_no_visit
```

## 3. Pós-visita

```text
post_visit
```

## 4. Lead dormente

```text
dormant_lead
```

## 5. Novo imóvel compatível

Previsto após catálogo/matching.

## 6. Baixa de preço

Previsto após catálogo/matching.

---

# 17. Stop conditions obrigatórias

Uma sequência para quando:

```text
lead respondeu
lead virou WON
lead virou LOST definitivo
lead pediu para parar
lead foi bloqueado
humano assumiu
objetivo foi atingido
visita foi marcada quando esse era o objetivo
canal ficou indisponível
```

---

# 18. Regra crítica de follow-up

Teste que precisa existir:

> Lead responde antes de `scheduled_at` → job incompatível é cancelado/bloqueado → nenhuma mensagem automática é enviada.

Essa regra é crítica para o produto.

---

# 19. Tabelas-base planejadas

```text
tenants
profiles
tenant_members
channel_connections
leads
lead_profiles
conversations
messages
lead_stage_history
activities
visits
properties
property_matches
followup_sequences
followup_steps
followup_jobs
consent_preferences
ai_runs
integration_syncs
audit_logs
```

O schema final será implementado via migrations.

---

# 20. Dados sensíveis / segurança

Requisitos adotados:

```text
RLS
auth
roles
segregação por tenant
secrets fora do Git
HTTPS
audit log
opt-out
backups
migrations
logs estruturados
```

---

# 21. Idempotência

Mensagens inbound deverão ser protegidas contra duplicação.

Chave lógica esperada:

```text
tenant_id + provider + external_message_id
```

Webhook repetido não pode gerar:

- mensagem duplicada;
- duas respostas;
- dois leads;
- dois follow-ups.

---

# 22. Observabilidade

Campos de correlação desejados:

```text
request_id
tenant_id
lead_id
conversation_id
provider
```

Alertas futuros:

```text
webhook failure
outbound failure
channel disconnected
AI error
followup failure
database error
CRM sync failure
```

---

# 23. Métricas do MVP

## Atendimento

```text
tempo até primeira resposta
% automático
% handoff
```

## Qualificação

```text
% qualificados
tempo até qualificação
abandono
```

## Comercial

```text
lead → visita
visita → proposta
proposta → fechamento
```

## Follow-up

```text
enviados
respondidos
leads recuperados
visitas após follow-up
fechamentos assistidos
```

## IA

```text
custo
latência
falhas
tokens
handoff rate
```

---

# 24. Métrica norte

Não medir sucesso pelo número de mensagens.

Métrica principal:

> **Leads/oportunidades recuperadas que provavelmente seriam esquecidas.**

Secundária:

> **Visitas geradas pelo sistema.**

---

# 25. Recursos explicitamente fora do MVP

Não construir inicialmente:

- ERP imobiliário completo;
- financeiro completo;
- gestão integral de contratos;
- emissão fiscal;
- assinatura eletrônica própria;
- app nativo;
- marketplace;
- portal imobiliário completo;
- substituição do CRM;
- Kubernetes;
- arquitetura de microserviços prematura;
- RAG sem necessidade;
- embeddings sem caso de uso real.

---

# 26. Fases oficiais

| Fase | Escopo                      | Estado      |
| ---- | --------------------------- | ----------- |
| 0    | Repositório e fundação      | **PRÓXIMA** |
| 1    | Banco / Auth / Multi-tenant | Pendente    |
| 2    | Message Gateway             | Pendente    |
| 3    | WhatsApp ida e volta        | Pendente    |
| 4    | Conversation Engine + IA    | Pendente    |
| 5    | CRM interno                 | Pendente    |
| 6    | Follow-up Engine            | Pendente    |
| 7    | Visitas                     | Pendente    |
| 8    | Catálogo + Match            | Pendente    |
| 9    | Instagram                   | Pendente    |
| 10   | CRM externo                 | Pendente    |
| 11   | Piloto real                 | Pendente    |
| 12   | SaaS comercial              | Pendente    |

---

# 27. Definition of Done geral

Toda fase deve comprovar:

- [ ] build;
- [ ] lint;
- [ ] typecheck;
- [ ] testes;
- [ ] migrations quando aplicável;
- [ ] secrets revisados;
- [ ] isolamento de tenant quando aplicável;
- [ ] tratamento de erro;
- [ ] logs;
- [ ] revisão de regressão;
- [ ] smoke test;
- [ ] documentação atualizada;
- [ ] memória atualizada.

---

# 28. Modelos sugeridos por fase

## Fase 0

```text
Claude Opus 5 — Max / Ultra Code
```

## Fase 1

```text
Claude Opus 5 — Ultra Code
Revisão: Opus 5 — Max
```

## Fase 2

```text
Claude Sonnet 5 — Ultra Code
Revisão: Opus 5 — High/Max
```

## Fase 3

```text
Claude Sonnet 5 — High/Ultra Code
```

## Fase 4

```text
Claude Opus 5 — Ultra Code
Refino/testes: Sonnet 5 — Ultra Code
```

## Fase 5

```text
Claude Sonnet 5 — Ultra Code
Revisão: Opus 5 — High
```

## Fase 6

```text
Claude Opus 5 — Ultra Code
Revisão: Opus 5 — Max
```

## Fase 7

```text
Claude Sonnet 5 — Ultra Code
```

## Fase 8

```text
Claude Sonnet 5 — Ultra Code
Revisão: Opus 5 — High
```

## Fase 9

```text
Claude Opus 5 — High/Ultra Code
```

## Fase 10

```text
Claude Opus 5 — Ultra Code
```

## Fase 11

Usar modelo forte para triagem de bugs/regressões conforme necessidade.

## Fase 12

Arquitetura e billing devem passar por revisão forte antes de produção.

---

# 29. Decisões rejeitadas / caminhos descartados

| Decisão                                                  | Motivo                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Construir tudo em n8n                                    | Estado crítico, segurança e escala ficariam presos aos workflows |
| Fazer apenas um chatbot de WhatsApp                      | Não resolve CRM, follow-up, métricas e escala                    |
| Acoplar domínio à Evolution API                          | Cria lock-in e retrabalho para produção                          |
| Tratar Evolution como integração de WhatsApp + Instagram | Canais possuem integrações e regras diferentes                   |
| Usar um prompt gigante para toda a IA                    | Reduz previsibilidade, testes e observabilidade                  |
| Deixar IA decidir disponibilidade de imóvel              | Disponibilidade deve vir da fonte de dados                       |
| Follow-up apenas por cron “parado há 3 dias”             | Não considera resposta, estado, objetivo e stop conditions       |
| Substituir o CRM atual no MVP                            | Aumenta muito o escopo antes da validação                        |
| Construir ERP completo                                   | Fora da dor central                                              |
| Construir app mobile primeiro                            | Dashboard web atende a validação                                 |
| Kubernetes/microserviços desde o começo                  | Complexidade sem demanda atual                                   |
| RAG/embeddings como requisito inicial                    | Matching e FAQ podem começar de forma mais simples               |

---

# 30. Pendências que bloqueiam decisões específicas

## Produto

1. **Nome definitivo do SaaS** — `[A DEFINIR]`.
2. Identidade visual do SaaS — `[A DEFINIR]`.
3. Domínio — `[A DEFINIR]`.

## Cliente zero

4. Nome/identificação formal do tenant piloto — `[A DEFINIR]`.
5. Quantos usuários participarão do piloto — `[A DEFINIR]`.
6. Número de WhatsApp dedicado ou número atual — `[A DEFINIR]`.
7. Conta profissional do Instagram disponível para integração — `[A DEFINIR]`.

## CRM

8. **Nome exato do CRM já utilizado** — `[A DEFINIR]`.
9. Documentação/API do CRM — depende do item 8.
10. Quais campos a empresa permite sincronizar — `[A DEFINIR]`.

## Imóveis

11. Fonte inicial do catálogo — `[A DEFINIR]`.
12. Existe exportação CSV? — `[A DEFINIR]`.
13. Existe API do CRM para imóveis? — `[A DEFINIR]`.

## Mensageria

14. Provider definitivo de WhatsApp para produção — `[A DEFINIR]`.
15. Estratégia exata de templates/janela oficial — definir quando o provider oficial entrar.
16. Configuração Meta do Instagram — `[A DEFINIR]`.

## Comercial

17. Nome dos planos — `[A DEFINIR]`.
18. Preço final — `[A DEFINIR]`.
19. Limites de usuários/canais/leads — `[A DEFINIR]`.
20. Setup fee — `[A DEFINIR]`.

Esses itens não bloqueiam a Fase 0.

A maioria também não bloqueia a Fase 1.

---

# 31. Problemas/riscos conhecidos

| Risco                                   | Situação          | Tratamento                                        |
| --------------------------------------- | ----------------- | ------------------------------------------------- |
| Lock-in de mensageria                   | Conhecido         | Adapter obrigatório                               |
| Mistura de dados entre imobiliárias     | Crítico           | `tenant_id` + RLS + testes                        |
| Webhook duplicado                       | Conhecido         | Idempotência                                      |
| IA inventar informação                  | Crítico           | Dados estruturados + guardrails + handoff         |
| Follow-up depois de resposta            | Crítico           | Stop conditions + cancelamento de jobs            |
| Automação virar spam                    | Conhecido         | Frequency caps + opt-out                          |
| n8n virar backend por conveniência      | Conhecido         | Regra explícita no `CLAUDE.md`                    |
| CRM ainda não identificado              | Aberto            | `CRMAdapter`; não implementar provider específico |
| Provider de produção ainda não fechado  | Aberto            | `MessagingProvider`                               |
| Custo de IA crescer                     | Futuro            | Registrar tokens/custo por tenant                 |
| Corrida entre resposta do lead e worker | Crítico na Fase 6 | locking + validação imediatamente antes do envio  |
| Feature creep                           | Permanente        | Gates por fase                                    |

---

# 32. Alterações realizadas

| Data       | Alteração                                                        |
| ---------- | ---------------------------------------------------------------- |
| 14/08/2026 | Consolidado o Plano Mestre do SaaS imobiliário                   |
| 14/08/2026 | Arquitetura evoluída de automação simples para SaaS multi-tenant |
| 14/08/2026 | n8n reposicionado como orquestrador auxiliar                     |
| 14/08/2026 | Criada diretriz de adapters de mensageria                        |
| 14/08/2026 | WhatsApp e Instagram separados arquiteturalmente                 |
| 14/08/2026 | Follow-up redesenhado como engine orientado a jobs/eventos       |
| 14/08/2026 | IA dividida em componentes funcionais                            |
| 14/08/2026 | Definidas regras de human takeover                               |
| 14/08/2026 | Adotado PostgreSQL como fonte de verdade                         |
| 14/08/2026 | Adotada estratégia multi-tenant desde o primeiro commit          |
| 14/08/2026 | Definidas fases 0–12                                             |
| 14/08/2026 | `CLAUDE.md` adaptado ao SaaS                                     |
| 14/08/2026 | `memoria.md` reiniciado para o novo produto                      |

---

# 33. Estado de implementação por componente

| Componente       | Estado         |
| ---------------- | -------------- |
| Plano Mestre     | Concluído      |
| CLAUDE.md        | Concluído      |
| memoria.md       | Concluído      |
| Repositório SaaS | Não confirmado |
| Monorepo         | Pendente       |
| Docker local     | Pendente       |
| Supabase         | Pendente       |
| Auth             | Pendente       |
| RLS              | Pendente       |
| Tenants          | Pendente       |
| Leads            | Pendente       |
| Conversations    | Pendente       |
| Messages         | Pendente       |
| Message Gateway  | Pendente       |
| WhatsApp         | Pendente       |
| IA               | Pendente       |
| CRM interno      | Pendente       |
| Follow-up Engine | Pendente       |
| Visitas          | Pendente       |
| Imóveis          | Pendente       |
| Instagram        | Pendente       |
| CRM externo      | Pendente       |
| Piloto           | Pendente       |
| Billing          | Pendente       |

---

# 34. Próxima missão — Fase 0

## Objetivo

Criar uma fundação reproduzível e segura.

## Entregáveis

```text
repositório
estrutura de pastas
workspace/monorepo
TypeScript
lint
formatter
testes
.env.example
Docker local
README
CI inicial
staging/base de ambientes
migrations preparadas
```

## Antes de codificar

O agente deve:

1. inspecionar o repositório;
2. verificar se já existe código;
3. verificar Git;
4. receber alterações remotas se aplicável;
5. identificar conflitos;
6. propor plano da Fase 0;
7. não apagar trabalho existente.

## Definition of Done da Fase 0

- [ ] instalação reproduzível;
- [ ] comandos documentados;
- [ ] lint passa;
- [ ] typecheck passa;
- [ ] teste inicial passa;
- [ ] build passa;
- [ ] Docker sobe quando aplicável;
- [ ] `.env.example` existe sem segredo;
- [ ] CI básico existe;
- [ ] README permite outro desenvolvedor começar;
- [ ] revisão final concluída.

## Modelo recomendado

```text
Claude Opus 5 — Max / Ultra Code
```

---

# 35. Missão seguinte — Fase 1

Só iniciar depois da Fase 0 aprovada.

## Escopo

```text
tenants
profiles
tenant_members
roles
Supabase Auth
RLS
leads
conversations
messages
audit_logs
migrations
testes de isolamento
```

## Testes críticos

### Isolamento

```text
Tenant A ≠ Tenant B
```

A não pode:

- ler;
- atualizar;
- deletar;
- inferir;

dados de B.

### Roles

```text
AGENT não possui poderes de OWNER
```

### Não autenticado

Sem acesso a dados privados.

## Modelo recomendado

```text
Claude Opus 5 — Ultra Code
```

Revisão:

```text
Claude Opus 5 — Max
```

---

# 36. Regra de atualização deste arquivo

Atualizar `memoria.md` quando ocorrer:

- decisão de produto;
- decisão arquitetural;
- mudança de stack;
- fase concluída;
- problema relevante;
- bug estrutural;
- pendência;
- integração confirmada;
- regra rejeitada;
- mudança de Definition of Done;
- descoberta que altere próximos passos.

Não registrar:

- cada comando executado;
- cada mensagem da conversa;
- detalhes irrelevantes;
- tentativa descartável sem consequência.

---

# 37. Regra de continuidade

Ao abrir o projeto novamente:

1. ler `CLAUDE.md`;
2. ler este arquivo;
3. identificar a fase atual;
4. conferir o repositório real;
5. comparar código com memória;
6. resolver divergências antes de continuar.

Nunca assumir que um plano foi executado apenas porque está documentado.

---

# 38. Resultado esperado do MVP vendável

O corretor deve conseguir:

1. receber os leads;
2. ver conversas;
3. deixar a IA qualificar;
4. enxergar dados estruturados;
5. saber quem está quente;
6. assumir conversa;
7. reagendar ou criar visita;
8. deixar o sistema lembrar follow-ups;
9. recuperar leads esquecidos;
10. encontrar pessoas compatíveis com imóveis;
11. acompanhar conversão.

Quando isso estiver funcionando e gerando comportamento real, começar a transformar o piloto em produto comercial.

---

# 39. Critério de validação

Não considerar validado apenas porque:

> “ficou bonito”

ou:

> “o corretor gostou”.

Sinais reais:

```text
uso diário
menos tempo manual
qualificação útil
follow-up gera resposta
visitas aumentam
leads são recuperados
erros são controláveis
usuário sentiria falta se o sistema fosse removido
```

---

# 40. Direção de monetização

Não congelada.

Princípio:

> cobrar pelo valor gerado, não pelo número de mensagens.

Valor percebido:

```text
tempo economizado
lead recuperado
visita gerada
oportunidade não perdida
gestão de equipe
```

Estrutura futura:

```text
Individual
Team
Business
Enterprise
```

Preço definitivo permanece `[A DEFINIR]` até o piloto produzir dados melhores de valor.

---

# 41. Próximo passo

**Executar somente a Fase 0.**

Depois:

1. revisar;
2. testar;
3. atualizar este arquivo;
4. informar se é necessário trocar modelo/esforço;
5. iniciar a Fase 1 somente após o gate.
