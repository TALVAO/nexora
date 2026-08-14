# CLAUDE.md — SaaS Imobiliário com IA, CRM Conversacional e Follow-up

Arquivo operacional principal do projeto.

**Leia este arquivo inteiro sempre que abrir o repositório e antes de propor, implementar, refatorar ou remover qualquer funcionalidade.**

---

## 1. O projeto

Estamos construindo um **SaaS imobiliário multi-tenant** para corretores, equipes e imobiliárias.

O produto começa validando uma operação real com um corretor que sofre com:

- alto volume de contatos;
- pouco tempo para responder;
- leads chegando principalmente por WhatsApp e Instagram;
- atendimento repetitivo;
- leads esquecidos;
- follow-up manual ou inexistente;
- necessidade de organizar melhor quem realmente possui potencial;
- uso de um CRM existente no trabalho, que **não será substituído no MVP**.

A prioridade operacional inicial é:

1. **locação**;
2. venda.

O produto **não é apenas um chatbot**.

A visão é construir um **sistema operacional comercial para corretores**, no qual IA, mensageria, CRM conversacional, follow-up, matching de imóveis e automações trabalham juntos.

---

## 2. Missão do produto

O sistema deverá, progressivamente:

1. receber leads de WhatsApp;
2. receber leads de Instagram;
3. registrar conversas;
4. identificar o lead;
5. qualificar automaticamente;
6. transformar conversa em dados estruturados;
7. organizar o lead em um funil;
8. identificar urgência e temperatura;
9. permitir atendimento humano;
10. executar follow-ups inteligentes;
11. registrar visitas;
12. registrar propostas, perdas e fechamentos;
13. sugerir imóveis compatíveis;
14. sincronizar dados úteis com CRMs externos;
15. distribuir leads entre corretores futuramente;
16. medir conversão e oportunidades recuperadas;
17. funcionar para vários clientes sem mistura de dados.

A frase de produto que deve orientar decisões é:

> **Nenhum lead imobiliário deve ser esquecido.**

---

## 3. Fontes de verdade

Ordem de autoridade do projeto:

1. **@Plano_Mestre_SaaS_Imobiliario_IA_Followup.md**  
   Escopo, arquitetura, fases, regras técnicas, banco, IA, follow-up e estratégia de evolução.

2. **@memoria.md**  
   Histórico vivo de decisões adotadas, decisões rejeitadas, problemas, pendências, alterações realizadas, fase atual e próximos passos.

3. **Código + migrations + testes aprovados da fase atual**  
   Depois que uma implementação for aprovada, o comportamento testado também se torna evidência do estado real do projeto.

4. **Documentação oficial das integrações**, quando uma implementação depender de comportamento externo que possa mudar.

Nunca tratar:

- conversa antiga;
- comentário isolado;
- exemplo;
- código abandonado;
- workflow antigo;
- tutorial da internet;

como fonte superior às fontes acima.

---

## 4. Regra de contradição — obrigatória

Se um pedido contradisser:

- o Plano Mestre;
- uma decisão registrada em `@memoria.md`;
- a arquitetura multi-tenant;
- uma regra de segurança;
- uma Definition of Done já aprovada;

**não faça a alteração silenciosamente.**

Antes de alterar:

1. aponte a contradição;
2. indique exatamente o que seria afetado;
3. explique a consequência técnica;
4. proponha a alternativa mais segura;
5. aguarde decisão quando a mudança for estrutural ou irreversível.

Exceção:

Se for uma correção inequívoca de bug, segurança ou inconsistência que não altera produto nem arquitetura, pode corrigir e registrar em `@memoria.md`.

---

## 5. Regra de escopo

Implemente **somente a fase atual**.

Não antecipar funcionalidades de fases futuras por conveniência.

Não criar código “para talvez usar depois”.

Não transformar uma tarefa pequena em uma reescrita ampla do projeto.

Antes de toda fase:

1. analisar o repositório;
2. confirmar o estado real;
3. comparar com o Plano Mestre e `memoria.md`;
4. listar arquivos que serão afetados;
5. apresentar plano resumido;
6. só então implementar.

---

## 6. Fases oficiais

A ordem padrão é:

```text
FASE 0  Repositório e fundação
FASE 1  Banco / Auth / Multi-tenant
FASE 2  Message Gateway
FASE 3  WhatsApp ida e volta
FASE 4  Conversation Engine + IA
FASE 5  CRM interno
FASE 6  Follow-up Engine
FASE 7  Visitas
FASE 8  Catálogo + Match de imóveis
FASE 9  Instagram
FASE 10 CRM externo
FASE 11 Piloto real
FASE 12 SaaS comercial
```

Não pular fases sem uma decisão explícita registrada em `memoria.md`.

---

## 7. Gate obrigatório ao final de cada fase

Uma fase não está concluída apenas porque “o código foi escrito”.

Antes de avançar:

- [ ] instalação funciona do zero;
- [ ] lint passa;
- [ ] typecheck passa;
- [ ] testes passam;
- [ ] build passa;
- [ ] migrations foram testadas;
- [ ] nenhum segredo foi exposto;
- [ ] tratamento de erro foi revisado;
- [ ] logs foram revisados;
- [ ] isolamento de tenant foi verificado quando aplicável;
- [ ] idempotência foi verificada quando aplicável;
- [ ] regressões foram procuradas;
- [ ] smoke test foi executado;
- [ ] README/documentação da fase foi atualizada;
- [ ] `memoria.md` foi atualizado;
- [ ] rollback ou estratégia de recuperação é conhecida.

Depois disso, faça uma **segunda revisão crítica** procurando:

- falhas de segurança;
- quebra de multi-tenancy;
- duplicação;
- race conditions;
- vazamento de segredo;
- inconsistência de dados;
- loops;
- retry incorreto;
- dependência indevida do provider;
- dependência indevida do n8n;
- IA executando ação não confirmada.

Ao finalizar, informe ao usuário:

1. o que foi feito;
2. testes executados;
3. riscos ou pendências;
4. se a fase pode ser considerada concluída;
5. **qual modelo e esforço usar na próxima etapa**, caso seja recomendável trocar.

---

# 8. Arquitetura aprovada

Stack-base:

```text
Frontend:
Next.js
TypeScript
Tailwind CSS

Backend:
Node.js
TypeScript
Fastify
Zod

Banco:
Supabase
PostgreSQL

Autenticação:
Supabase Auth

Automação:
n8n self-hosted

Infra:
Docker
Docker Compose
HTTPS
GitHub
CI/CD
```

Essa stack não deve ser alterada sem decisão explícita.

---

## 9. Regra arquitetural principal

> **PostgreSQL é a fonte de verdade do negócio.**

Nunca fazer com que o estado oficial dependa exclusivamente de:

- memória da IA;
- histórico bruto do WhatsApp;
- workflow ativo no n8n;
- sessão do navegador;
- cache;
- variável em memória;
- estado do frontend.

Dados importantes devem estar persistidos e rastreáveis.

---

## 10. Multi-tenant é obrigatório desde o início

Mesmo com apenas um cliente real.

Toda entidade comercial relevante deverá estar vinculada a:

```text
tenant_id
```

Não hardcodar:

- nome do primeiro corretor;
- nome da primeira imobiliária;
- número do primeiro WhatsApp;
- regras específicas do primeiro cliente;

no domínio compartilhado.

Configurações específicas devem viver em dados/configuração do tenant.

---

## 11. Isolamento de dados

Nunca confiar apenas em filtro no frontend.

Exemplo insuficiente:

```ts
.where("tenant_id", tenantId)
```

A proteção deve existir também no banco.

Usar Row Level Security quando a tabela estiver exposta pelo stack Supabase.

Teste obrigatório:

```text
Tenant A não consegue ler, alterar ou inferir dados do Tenant B.
```

Esse teste deverá existir de forma automatizada na Fase 1.

---

## 12. Papéis

Papéis-base:

```text
OWNER
MANAGER
AGENT
VIEWER
```

Não criar novas permissões arbitrariamente.

Toda alteração de autorização deve possuir:

- justificativa;
- teste;
- registro em memória.

---

## 13. Regra de mensageria

O domínio nunca deve depender diretamente de um provider específico.

Usar a abstração conceitual:

```ts
interface MessagingProvider {
  sendText(input: SendTextInput): Promise<SendResult>;
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;
  normalizeInbound(payload: unknown): NormalizedMessage;
  getDeliveryStatus(payload: unknown): DeliveryStatus;
}
```

Providers esperados:

```text
EvolutionWhatsAppProvider
MetaWhatsAppCloudProvider
InstagramMessagingProvider
```

O restante do sistema trabalha com mensagens normalizadas.

---

## 14. WhatsApp e Instagram são canais separados

Não tratar Evolution API como integração genérica de WhatsApp + Instagram.

Fluxo correto:

```text
WhatsApp
  ↓
WhatsApp Adapter
  ↓

Instagram
  ↓
Instagram Adapter
  ↓

Normalized Message Gateway
  ↓
Backend / Conversation Engine
```

A adição de um novo canal não deve exigir reescrever:

- lead;
- conversation;
- message;
- follow-up;
- IA;
- CRM.

---

## 15. Evolution API

Pode ser usada para acelerar desenvolvimento e piloto controlado.

Mas:

- não acoplar o domínio à Evolution;
- não assumir payloads dela fora do adapter;
- não armazenar credenciais no frontend;
- não construir a proposta comercial do SaaS dependendo obrigatoriamente de um único provider.

A arquitetura deve permitir evolução para integração oficial.

---

## 16. n8n

O n8n é **orquestrador auxiliar**.

Pode cuidar de:

- schedules;
- notificações;
- health checks;
- retries operacionais;
- sincronizações;
- relatórios;
- workflows internos.

O n8n **não é o cérebro do SaaS**.

Não armazenar apenas em workflow:

- estágio do lead;
- regras comerciais;
- estado do follow-up;
- permissões;
- score;
- consentimento;
- histórico;
- tenant;
- regra de roteamento.

A regra vive no backend + banco.

---

## 17. Regra para workflows do n8n

Preferir workflows pequenos, versionáveis e com responsabilidade única.

Exemplos:

```text
workflow-01-provider-health
workflow-02-followup-trigger
workflow-03-crm-sync-retry
workflow-04-daily-report
workflow-05-operational-alerts
```

Evitar um workflow monolítico com dezenas de responsabilidades.

---

## 18. Message Gateway

Todo inbound deverá seguir a sequência:

```text
webhook
↓
validar origem
↓
normalizar payload
↓
checar idempotência
↓
resolver tenant
↓
resolver canal
↓
resolver lead
↓
persistir mensagem
↓
atualizar timestamps
↓
cancelar jobs incompatíveis
↓
decidir HUMAN ou AI
↓
Conversation Engine
```

Não chamar IA antes de a mensagem estar persistida.

---

## 19. Idempotência

Webhooks podem ser reenviados.

Criar chave lógica semelhante a:

```text
tenant_id
provider
external_message_id
```

Se já existir:

```text
não processar novamente
```

Duplicação de mensagem é bug crítico.

---

## 20. Retry

Erros temporários devem possuir retry limitado e observável.

Nunca criar retry infinito.

Depois do limite:

```text
FAILED
```

e registrar contexto suficiente para diagnóstico.

---

# 21. Regras de IA

A IA é um componente de apoio ao domínio.

Não deve controlar silenciosamente regras críticas.

Separar responsabilidades:

```text
1. Intent Classifier
2. Structured Extractor
3. Next Action Policy
4. Response Generator
```

Não substituir tudo por um único prompt gigante.

---

## 22. Extração estruturada

Quando uma informação não estiver presente:

```json
null
```

Nunca inventar.

A IA só pode marcar um fato como conhecido se ele vier de:

- mensagem do lead;
- banco;
- base oficial do tenant;
- integração confiável.

---

## 23. Guardrails da IA

A IA nunca deve inventar:

- preço;
- disponibilidade;
- endereço;
- taxa;
- condição;
- documentação;
- garantia;
- regra de imóvel;
- comissão;
- aprovação;
- situação jurídica;
- ação executada.

Quando não souber:

- assumir incerteza;
- encaminhar para humano;
- ou solicitar confirmação através do sistema.

---

## 24. Human takeover

O sistema deve suportar:

```text
automation_mode = AI
automation_mode = HUMAN
```

Se estiver em HUMAN:

**nenhuma resposta automática deve ser enviada**, salvo automação explicitamente permitida e testada.

Transferir para humano quando:

- cliente pedir;
- negociação;
- proposta;
- reclamação;
- dúvida jurídica;
- baixa confiança;
- erro repetido;
- ação sensível;
- lead pronto para fechamento.

---

## 25. IA não confirma ação inexistente

Frases como:

> “Sua visita está confirmada.”

só podem ser enviadas depois de o backend confirmar que a visita realmente foi criada.

O modelo não pode simular sucesso de operações.

---

# 26. Lead scoring

O score inicial deve ser híbrido e determinístico.

A IA pode extrair sinais.

A regra final do score pertence ao domínio.

Não permitir que o LLM sozinho decida quem “merece” atendimento.

---

# 27. Funil-base

Usar inicialmente:

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

Não adicionar novos estágios sem necessidade real.

---

# 28. Follow-up é motor de domínio

Não implementar follow-up como simples cron de “lead parado há X dias”.

Modelo:

```text
Evento
↓
Regra
↓
Follow-up Job
↓
Scheduler
↓
Validação
↓
Envio
↓
Registro
↓
Próximo passo
```

Cada job precisa poder ser:

```text
PENDING
PROCESSING
SENT
CANCELLED
BLOCKED
FAILED
```

---

## 29. Stop conditions

Antes de qualquer envio, verificar:

```text
lead respondeu?
lead está ativo?
lead virou WON?
lead virou LOST definitivo?
lead pediu opt-out?
humano assumiu?
objetivo já foi atingido?
visita já foi agendada?
canal continua válido?
frequência permite?
```

Se qualquer regra bloquear:

**não enviar**.

---

## 30. Teste crítico de follow-up

Obrigatório:

> Se o lead responder antes do horário agendado, o follow-up pendente correspondente não pode ser enviado.

Uma implementação que falha nesse teste não pode avançar de fase.

---

# 31. Imóveis e matching

No início, usar filtros determinísticos.

Nunca deixar a IA afirmar que um imóvel está disponível sem fonte de verdade.

A IA pode:

- explicar match;
- resumir vantagens;
- adaptar linguagem.

Ela não decide disponibilidade.

---

## 32. CRM externo

O CRM atual da operação é **[A DEFINIR]**.

Até sua identificação:

não escrever integração específica.

Usar interface:

```ts
interface CRMAdapter {
  upsertLead(...): Promise<SyncResult>;
  createActivity(...): Promise<SyncResult>;
  createVisit(...): Promise<SyncResult>;
  updateStage(...): Promise<SyncResult>;
}
```

Possíveis modos iniciais:

```text
NO_SYNC
CSV_EXPORT
WEBHOOK
API
```

---

# 33. Dados ainda não confirmados

Nunca inventar.

Usar `[A DEFINIR]` e registrar em `memoria.md`.

Atualmente incluem, no mínimo:

- nome comercial definitivo do SaaS;
- CRM exato utilizado pela operação piloto;
- disponibilidade e documentação da API desse CRM;
- conta/configuração Meta usada no piloto;
- provedor definitivo de WhatsApp em produção;
- regras comerciais definitivas de planos;
- preços finais;
- limites por plano.

---

# 34. Segurança

Obrigatório desde a fundação:

- autenticação;
- autorização;
- RLS;
- segregação de tenant;
- secrets fora do código;
- HTTPS;
- logs estruturados;
- auditoria;
- backups;
- migrations;
- mínimo privilégio;
- tratamento de opt-out;
- política de retenção;
- minimização de dados.

---

## 35. Secrets

Nunca commitar:

```text
API keys
tokens
senhas
service role keys
connection strings privadas
credenciais de provider
```

Usar:

```text
.env
.env.example
secret manager / variáveis protegidas
```

O `.env.example` nunca contém segredo real.

---

# 36. LGPD

Coletar somente dados necessários para:

- qualificação;
- atendimento;
- visita;
- follow-up permitido;
- operação comercial.

Não coletar dados “porque podem ser úteis depois”.

Registrar opt-out.

Garantir que uma solicitação de parar mensagens interrompa automações aplicáveis.

---

# 37. Logs

Logs estruturados devem, quando disponíveis, carregar:

```text
request_id
tenant_id
lead_id
conversation_id
provider
```

Não logar desnecessariamente:

- tokens;
- senhas;
- payloads completos com dados sensíveis;
- secrets;
- credenciais.

---

# 38. Banco e migrations

Toda mudança de schema deve ser versionada.

Nunca:

- mudar banco de produção manualmente;
- apagar migration aprovada;
- alterar migration antiga que já chegou a ambiente compartilhado.

Criar nova migration.

Fluxo:

```text
migration
↓
teste local
↓
staging
↓
backup quando aplicável
↓
produção
↓
smoke test
```

---

# 39. Regras de código

- TypeScript estrito.
- Evitar `any` sem justificativa real.
- Validar fronteiras externas com Zod ou equivalente aprovado.
- Funções e módulos com responsabilidade clara.
- Nada especulativo.
- Não criar abstração sem necessidade, exceto abstrações arquiteturais já aprovadas no Plano Mestre.
- Mudanças cirúrgicas.
- Não refatorar área não relacionada à tarefa sem autorização.
- Erros devem ser explícitos e observáveis.
- Nenhum `catch {}` silencioso.
- Nenhum segredo hardcoded.
- Nenhum `tenant_id` confiado ao input do cliente sem autorização.
- Nenhuma ação comercial importante deve depender só de estado do frontend.
- Texto de interface em português do Brasil no MVP.
- Nomes internos de código podem ser em inglês para manter consistência técnica.

---

# 40. Estrutura de repositório esperada

```text
realestate-ai/
│
├── apps/
│   ├── web/
│   └── api/
│
├── workers/
│   └── followup-worker/
│
├── packages/
│   ├── domain/
│   ├── database/
│   ├── ai/
│   ├── messaging/
│   ├── crm/
│   ├── validation/
│   └── shared/
│
├── supabase/
│   ├── migrations/
│   └── seed/
│
├── n8n/
│   └── workflows/
│
├── infra/
│   ├── docker/
│   └── compose/
│
├── docs/
│
├── .env.example
├── CLAUDE.md
├── memoria.md
└── README.md
```

A estrutura pode ser ajustada se houver motivo técnico comprovado, mas não silenciosamente.

---

# 41. Testes

Tipos esperados:

## Unitários

- scoring;
- qualification;
- stop conditions;
- matching;
- normalização;
- regras do domínio.

## Integração

- webhook;
- banco;
- provider;
- AI;
- CRM adapter.

## E2E

Fluxo mínimo:

```text
lead envia mensagem
↓
mensagem é persistida
↓
IA qualifica
↓
dados são extraídos
↓
lead avança
↓
follow-up é criado
↓
lead responde
↓
follow-up é cancelado
↓
humano assume
```

---

# 42. Testes de IA

Manter fixtures versionadas.

Mudanças em:

- prompt;
- provider;
- modelo;
- schema;

não devem ser aprovadas apenas porque “parecem melhores”.

Comparar contra casos esperados.

---

# 43. Feature flags

Recursos de risco devem poder ser desativados:

```text
ai_auto_reply_enabled
followup_auto_send_enabled
instagram_enabled
property_matching_enabled
crm_sync_enabled
```

No piloto, iniciar conservador.

---

# 44. Shadow mode

Antes de liberar auto-reply para operações sensíveis:

```text
IA gera
↓
sistema salva
↓
humano revisa
↓
não envia automaticamente
```

Depois da validação:

ativar automação de forma controlada.

---

# 45. Ambientes

Manter:

```text
local
staging
production
```

Não testar mudança destrutiva diretamente em produção.

---

# 46. CI

Todo Pull Request deverá, progressivamente, rodar:

```text
install
lint
typecheck
test
build
```

Falhou:

**não tratar como concluído.**

---

# 47. Git

Antes de iniciar uma fase:

- conferir branch;
- conferir mudanças locais;
- receber alterações remotas relevantes;
- evitar sobrescrever trabalho de outro desenvolvedor.

Commits devem ser:

- pequenos;
- intencionais;
- relacionados à fase;
- reversíveis.

---

# 48. Não fazer

Não:

- transformar n8n no backend;
- hardcodar o cliente zero;
- misturar tenants;
- criar bot monolítico;
- usar um prompt gigante para tudo;
- deixar IA inventar informação;
- confiar só no frontend para autorização;
- disparar follow-up sem stop conditions;
- depender de um provider;
- implementar CRM antes de saber qual CRM é;
- construir ERP imobiliário completo no MVP;
- criar app nativo antes da validação;
- criar microserviços prematuramente;
- adicionar Kubernetes;
- adicionar RAG sem necessidade comprovada;
- usar embeddings apenas por modismo;
- criar feature de fase futura sem aprovação;
- remover teste para “fazer passar”.

---

# 49. Prioridade de produto

Quando houver conflito entre funcionalidades, priorizar:

1. integridade de dados;
2. segurança;
3. isolamento multi-tenant;
4. confiabilidade da mensageria;
5. human takeover;
6. qualificação;
7. follow-up;
8. usabilidade do corretor;
9. métricas;
10. sofisticação visual.

Uma interface bonita nunca justifica quebrar dados ou domínio.

---

# 50. Critério para uma decisão técnica

Antes de escolher uma tecnologia ou abstração, pergunte:

1. resolve problema atual?
2. mantém o MVP simples?
3. cria lock-in desnecessário?
4. compromete multi-tenancy?
5. compromete segurança?
6. dificulta troca de provider?
7. pode ser testada?
8. pode ser observada?
9. pode ser revertida?
10. está dentro da fase atual?

---

# 51. Modelo e esforço por tipo de trabalho

Quando solicitado a recomendar modelo para continuar:

## Arquitetura, banco, segurança, follow-up

```text
Claude Opus 5
Max / Ultra Code
```

## Feature bem delimitada

```text
Claude Sonnet 5
Ultra Code
```

## Revisão crítica

```text
Claude Opus 5
Max
```

## Segunda opinião independente

```text
GPT-5.6 Sol
esforço alto
```

Não trocar modelo no meio de uma tarefa sem motivo.

Ao final de cada fase, indicar se a próxima fase merece troca de modelo/esforço.

---

# 52. Estado atual do projeto

Documentação estratégica concluída.

Existe um Plano Mestre do produto.

**Não assumir que qualquer código do SaaS já foi implementado até verificar o repositório.**

Fase oficial para iniciar:

```text
FASE 0 — Repositório e fundação
```

seguida por:

```text
FASE 1 — Banco / Auth / Multi-tenant
```

O próximo passo real está registrado em `@memoria.md`.

---

# 53. Regra final

Se houver dúvida entre:

> fazer mais rápido

e:

> preservar arquitetura, dados e possibilidade de escala

escolha a segunda opção, **sem adicionar complexidade especulativa**.

O sistema deve começar pequeno, mas não nascer descartável.
