# Mini-relatório — Etapa 4: Conversation Engine + IA

## Status

**CONCLUÍDA**

---

## Objetivo da Etapa

Construir o motor conversacional com Inteligência Artificial baseado na arquitetura modular de 4 estágios (`Classificar` ➔ `Extrair` ➔ `Decidir` ➔ `Responder`), sem prompts monolíticos, com guardrails estritos contra alucinação de dados imobiliários, human takeover automático, suporte a opt-out e rastreabilidade total via `ai_runs`.

---

## O que foi implementado

1. **Classificador de Intenções (`IntentClassifier`):**
   - 13 categorias canônicas implementadas: `GREETING`, `RENTAL_SEARCH`, `PURCHASE_SEARCH`, `PROPERTY_QUESTION`, `SCHEDULE_VISIT`, `RESCHEDULE`, `CANCEL_VISIT`, `DOCUMENTATION`, `PRICE_NEGOTIATION`, `HUMAN_REQUEST`, `COMPLAINT`, `STOP_MESSAGES`, `OTHER`.
   - Detecção prioritária de segurança para cancelamento/opt-out e pedidos de atendimento humano.

2. **Extrator Estruturado (`StructuredExtractor`):**
   - Extração determinística e sem alucinações de: tipo de transação (locação vs compra com tratamento de mudança de ideia), tipo de imóvel, quartos, vagas de garagem, orçamentos textuais ("4 mil e quinhentos", "3,5k", "800 mil"), múltiplos bairros em array, compatibilidade com pets, prazo de mudança e garantias locatícias.
   - Campos não informados permanecem estritamente como `null`.

3. **Política de Próxima Ação (`NextActionPolicy`):**
   - Avaliação do estado atual da qualificação e escolha da próxima pergunta mais valiosa (máximo de 1 pergunta por mensagem, evitando efeito interrogatório).
   - Acionamento imediato de `HANDOFF_HUMAN` para: pedidos de humano, reclamações, negociação de valores e baixa confiança da IA.

4. **Gerador de Respostas com Guardrails (`ResponseGenerator`):**
   - Respostas naturais e objetivas em português do Brasil.
   - Tratamento de incerteza para perguntas sobre detalhes não cadastrados na base (ex: regras específicas de condomínio ou estrutura física do imóvel), com aviso transparente de que o corretor confirmará a informação.

5. **Orquestrador `ConversationEngine` & Integração:**
   - Orquestração do ciclo completo e geração de registros de auditoria na tabela PostgreSQL `ai_runs` (latência, tokens, confiança, decisão).
   - Integração com `MessageGateway` para resposta automática, atualização de fatos em `lead_profiles` e troca de `automation_mode` para `HUMAN` em transferências.

---

## Testes Executados

| Suite de Testes                       | Quantidade                 | Resultado                                                                                                                                                                                                                                                             |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation-engine.test.ts` (IA)    | 14 testes                  | **Aprovado** (Dataset obrigatório completo: lead direto, confuso, mudança de ideia, compra->locação, locação->venda, mensagem curta, áudio transcrito, orçamento falado, bairro múltiplo, pedido de humano, reclamação, negociação, pergunta não existente e opt-out) |
| `conversations.test.ts` (API)         | 5 testes                   | **Aprovado** (Outbound de texto, mídia, histórico e status)                                                                                                                                                                                                           |
| `webhooks.test.ts` (API)              | 5 testes                   | **Aprovado** (Inbound WhatsApp, Instagram, desafio Meta e deduplicação)                                                                                                                                                                                               |
| `evolution.provider.test.ts`          | 3 testes                   | **Aprovado** (Normalização e envio)                                                                                                                                                                                                                                   |
| `meta-cloud.provider.test.ts`         | 2 testes                   | **Aprovado** (Normalização Meta e tokens)                                                                                                                                                                                                                             |
| `instagram.provider.test.ts`          | 2 testes                   | **Aprovado** (Normalização Instagram e tokens)                                                                                                                                                                                                                        |
| `message-gateway.test.ts`             | 2 testes                   | **Aprovado** (Pipeline de entrada, lead resolution e deduplicação)                                                                                                                                                                                                    |
| Testes de Banco e RLS (Etapa 1)       | 11 testes                  | **Aprovado** (Isolamento de tenant, RBAC, tenant context)                                                                                                                                                                                                             |
| Testes de Contratos e Saúde (Etapa 0) | 7 testes                   | **Aprovado** (Health check, validação, shared, domain, crm)                                                                                                                                                                                                           |
| **Total Geral**                       | **50 testes em 16 suites** | **100% Aprovados**                                                                                                                                                                                                                                                    |

---

## Verificação de Build, Lint e Tipagem

- `npm run format:check`: 100% aprovado
- `npm run typecheck`: 0 erros em todos os 8 workspaces
- `npm run test`: 50 testes passando em 16 arquivos de teste
- `npm run build`: Build de produção gerado sem falhas

---

## Revisão de Guardrails de IA

- [x] **Zero Alucinação:** A IA nunca inventa valores de condomínio, IPTU ou regras prediais não cadastradas.
- [x] **Human Takeover Imediato:** Pedidos de desconto, insatisfações ou solicitações de atendente transferem a conversa para `HUMAN` e notificam o corretor.
- [x] **Auditoria Completa:** Cada execução gera um registro rastreável em `ai_runs`.

---

## Próxima Etapa

**ETAPA 5 — CRM Interno** (Visualização e gestão do funil com 10 estágios, kanban/lista de leads, drawer de conversa com human takeover, filtros por temperatura/urgência e edição de perfil qualificado).
