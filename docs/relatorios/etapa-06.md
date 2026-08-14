# Mini-relatório — Etapa 6: Follow-up Engine

## Status
**CONCLUÍDA**

---

## Objetivo da Etapa
Construir o motor proativo e contextual de follow-up do SaaS, projetado como o maior diferencial competitivo do produto imobiliário. Implementar agendamento de jobs, sequências contextuais (`qualification_abandoned`, `qualified_no_visit`, `post_visit`, `dormant_lead`), limite rigoroso de frequência (*frequency cap* de 3 mensagens/semana) e 7 *stop conditions* invioláveis — assegurando que **um follow-up jamais seja enviado se o lead tiver respondido antes do horário agendado**.

---

## O que foi implementado

1. **FollowupScheduler (`@nexora/messaging`):**
   - Agendamento de jobs com status canônicos (`PENDING`, `PROCESSING`, `SENT`, `CANCELLED`, `BLOCKED`, `FAILED`).
   - Avaliação rigorosa das **7 Stop Conditions Obrigatórias**:
     1. **Resposta do Lead:** Cancela imediatamente se `lead.last_inbound_at > job.created_at`.
     2. **Estágio WON:** Cancela se o lead já fechou negócio.
     3. **Estágio LOST:** Cancela se o lead foi perdido definitivamente.
     4. **Human Takeover:** Bloqueia envio automático se o atendimento estiver sob controle humano (`automation_mode === 'HUMAN'`).
     5. **Opt-Out LGPD:** Bloqueia envio se houver descadastro registrado em `consent_preferences`.
     6. **Visita Agendada:** Cancela sequências de qualificação se a visita já tiver sido agendada ou realizada.
     7. **Frequency Cap:** Bloqueia o envio se o lead já tiver recebido 3 ou mais mensagens nos últimos 7 dias.
   - Processamento concorrente seguro com `FOR UPDATE SKIP LOCKED`, bloqueio por `locked_at`/`locked_by` e retry exponencial limitado com limite de 3 tentativas.

2. **Cancelamento Automático no MessageGateway:**
   - Integração direta no pipeline de entrada: toda mensagem inbound de lead recebida via WhatsApp/Instagram cancela de forma atômica e instantânea todos os jobs pendentes de follow-up daquele lead.

3. **FollowupRepository (`@nexora/database`):**
   - Métodos tipados: `createJob()`, `listJobs()`, `findJobById()`, `cancelJobsForLead()`, `cancelJob()`, `blockJob()`, `markJobSent()`, `incrementJobAttempts()`, `lockDueJobs()`, `checkLeadOptOut()`, `countRecentSentFollowups()`, `listSequences()`.

4. **Rotas de API (`apps/api/src/routes/followups.ts`):**
   - `GET /api/followups/jobs`: Listagem com filtros por status e lead.
   - `POST /api/followups/jobs`: Agendamento manual ou automatizado de jobs.
   - `POST /api/followups/jobs/:id/cancel`: Cancelamento com justificativa.
   - `POST /api/followups/process`: Trigger de execução da fila de jobs vencidos (para workers ou cron n8n).
   - `GET /api/followups/sequences`: Listagem das sequências ativas.

---

## Testes Executados

| Suite de Testes | Quantidade | Resultado |
|---|---|---|
| `followup-scheduler.test.ts` (Messaging) | 7 testes | **Aprovado** (**CRITICAL DoD:** cancelamento se o lead respondeu, WON, LOST, HUMAN takeover, opt-out, fila de execução e envio) |
| `followups.test.ts` (API) | 6 testes | **Aprovado** (Listagem, agendamento, validação 400, cancelamento, processamento de fila e sequências) |
| `leads.test.ts` (API) | 7 testes | **Aprovado** (Filtros, Lead 360, takeover, perfil, atividades, estágio) |
| `dashboard.test.ts` (API) | 1 teste | **Aprovado** (Métricas do funil comercial) |
| `conversation-engine.test.ts` (IA) | 14 testes | **Aprovado** (Dataset obrigatório completo de 14 cenários) |
| `conversations.test.ts` (API) | 5 testes | **Aprovado** (Outbound de texto, mídia, histórico e status de canais) |
| `webhooks.test.ts` (API) | 5 testes | **Aprovado** (Inbound WhatsApp, Instagram, desafio Meta e deduplicação) |
| `evolution.provider.test.ts` | 3 testes | **Aprovado** (Normalização e envio) |
| `meta-cloud.provider.test.ts` | 2 testes | **Aprovado** (Normalização Meta e tokens) |
| `instagram.provider.test.ts` | 2 testes | **Aprovado** (Normalização Instagram e tokens) |
| `message-gateway.test.ts` | 2 testes | **Aprovado** (Pipeline com cancelamento de follow-up no inbound) |
| Testes de Banco e RLS (Etapa 1) | 11 testes | **Aprovado** (Isolamento de tenant, RBAC, tenant context) |
| Testes de Contratos e Saúde (Etapa 0) | 7 testes | **Aprovado** (Health check, validação, shared, domain, crm) |
| **Total Geral** | **66 testes em 19 suites** | **100% Aprovados** |

---

## Verificação de Build, Lint e Tipagem
- `npm run format:check`: 100% aprovado
- `npm run typecheck`: 0 erros em todos os 8 workspaces
- `npm run test`: 66 testes passando em 19 arquivos de teste
- `npm run build`: Build de produção do Next.js 14 e de todos os pacotes gerado com sucesso

---

## Definition of Done (DoD) Verificada
> **"Um follow-up jamais é enviado se o lead respondeu antes do horário."**
- **Testado e comprovado:** O teste automatizado no Vitest valida que se `lead.last_inbound_at > job.created_at`, o job é marcado como `CANCELLED` com razão `"Lead respondeu antes do horário agendado do follow-up"` e nunca é despachado.

---

## Próxima Etapa
**ETAPA 7 — Visitas** (Fluxo operacional completo de agendamento de visitas com integração de calendário, reagendamento, cancelamento, confirmação via WhatsApp e registro de feedback pós-visita).
