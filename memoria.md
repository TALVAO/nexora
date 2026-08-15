# memoria.md — Histórico vivo do SaaS Imobiliário

Registro somente do que ajuda a continuidade do projeto.

**Não é log de conversa.**

Última atualização: 14/08/2026

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

- Integração completa com Instagram Direct via Meta Graph API v19.0 com suporte a DMs, respostas e menções a Stories.
- Resolução e unificação não-destrutiva de identidade cross-channel (`linkIdentity`, `mergeLeads`) permitindo transição de leads entre Instagram e WhatsApp sem perda de histórico.
- 88 testes automatizados passando 100% em 22 arquivos de teste.

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
```

Próxima fase (aguardando autorização):

```text
FASE 10 — CRM externo
```

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
