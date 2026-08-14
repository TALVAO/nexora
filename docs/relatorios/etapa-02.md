# Mini-relatório — Etapa 2: Message Gateway

## Status
**CONCLUÍDA**

---

## Objetivo da Etapa
Construir a camada agnóstica de mensageria e o Message Gateway, permitindo o recebimento, validação de tokens/assinaturas, normalização para o formato canônico `NormalizedMessage`, resolução automática de tenant/lead/conversa, controle rigoroso de idempotência e persistência de mensagens de WhatsApp e Instagram sem acoplar o domínio a um provedor específico.

---

## O que foi implementado

1. **Endpoints de Webhook (`apps/api`):**
   - `GET /webhooks/whatsapp/:provider`: Verificação de desafio e handshake da Meta WhatsApp Cloud API (`hub.challenge` / `hub.verify_token`).
   - `POST /webhooks/whatsapp/:provider`: Recepção de webhooks de WhatsApp (Evolution API, Meta Cloud, Mock).
   - `GET /webhooks/instagram/:provider`: Verificação de desafio do Instagram Graph API.
   - `POST /webhooks/instagram/:provider`: Recepção de webhooks de mensagens do Instagram Direct.

2. **Provedores de Mensageria (`@nexora/messaging`):**
   - **`EvolutionWhatsAppProvider`:** Normalização de eventos `messages.upsert`, mensagens de texto, mídias (áudio, imagem, vídeo, documento) e contatos.
   - **`MetaWhatsAppCloudProvider`:** Normalização dos payloads oficiais da Meta Cloud API com verificação de webhook tokens.
   - **`InstagramMessagingProvider`:** Normalização de mensagens do Instagram Graph API e mídias anexadas.
   - **`MockMessagingProvider`:** Provedor determinístico para testes e validação de ambientes.

3. **Orquestrador `MessageGateway`:**
   - Registro dinâmico de providers por canal (`WHATSAPP`, `INSTAGRAM`).
   - Pipeline de processamento de mensagens de entrada (inbound):
     1. Normalização do payload para `NormalizedMessage`.
     2. Resolução do tenant via headers ou query (`x-tenant-id`).
     3. Resolução ou criação de Lead (por telefone no WhatsApp ou `instagram_user_id` no Instagram).
     4. Resolução ou criação de Conversa (`conversations`).
     5. Persistência de mensagem com verificação de chave de idempotência (`uq_message_idempotency`).
     6. Atualização de timestamps de recência (`last_inbound_at` no Lead e `last_message_at` na Conversa).
     7. Retorno do modo de automação (`AI` vs `HUMAN`) para direcionamento seguro.

---

## Testes Executados

| Suite de Testes | Quantidade | Resultado |
|---|---|---|
| `webhooks.test.ts` (API) | 5 testes | **Aprovado** (Verificação de webhook Meta/Instagram, inbound WhatsApp/Instagram e idempotência via HTTP) |
| `evolution.provider.test.ts` | 3 testes | **Aprovado** (Normalização de texto, imagem com caption e validação de chave) |
| `meta-cloud.provider.test.ts` | 2 testes | **Aprovado** (Normalização Meta Cloud API e validação de token) |
| `instagram.provider.test.ts` | 2 testes | **Aprovado** (Normalização Instagram Direct e verificação de token) |
| `message-gateway.test.ts` | 2 testes | **Aprovado** (Pipeline completo e detecção de duplicados) |
| Testes de Banco e RLS (Etapa 1) | 11 testes | **Aprovado** (Isolamento de tenant, RBAC, tenant context) |
| Testes de Contratos e Saúde (Etapa 0) | 7 testes | **Aprovado** (Health check, validação, shared, domain, ai, crm) |
| **Total Geral** | **32 testes em 15 suites** | **100% Aprovados** |

---

## Verificação de Build, Lint e Tipagem
- `npm run format:check`: 100% aprovado
- `npm run typecheck`: 0 erros em todos os 8 workspaces
- `npm run test`: 32 testes passando em 15 arquivos de teste
- `npm run build`: Build de produção gerado sem falhas

---

## Revisão de Segurança e Idempotência
- [x] **Deduplicação Comprovada:** Se o webhook reenviar o mesmo payload, a API retorna `200 OK` com `duplicate: true`, preservando a mensagem original e impedindo registros duplicados no banco.
- [x] **Agnosticismo de Provedor:** Nenhuma dependência da Evolution API ou Meta vaza para as entidades de negócio.
- [x] **Segurança de Webhook:** Endpoints rejeitam tokens de verificação inválidos com `403 Forbidden`.
- [x] **Segredos:** Nenhuma credencial real exposta no código.

---

## Próxima Etapa
**ETAPA 3 — WhatsApp de Teste** (Conexão e validação do fluxo de ida e volta de mensagens reais: WhatsApp -> Backend -> Banco -> Backend -> WhatsApp, status de entrega, reconexão e tratamento de mídias sem IA ainda).
