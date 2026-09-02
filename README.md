# Nexora — SaaS Imobiliário com IA, CRM Conversacional e Follow-up

> **Missão:** _"Nenhum lead imobiliário deve ser esquecido."_

Nexora é um sistema operacional comercial para corretores, equipes e imobiliárias, unificando atendimento omnichannel (WhatsApp e Instagram), qualificação estruturada com IA, CRM conversacional, motor de follow-up resiliente e matching inteligente de imóveis.

---

## 🏛️ Arquitetura do Monorepo

```text
nexora/
├── apps/
│   ├── api/          # Backend Fastify + TypeScript + Zod
│   └── web/          # Frontend Next.js (App Router) + Tailwind CSS
├── packages/
│   ├── shared/       # Constantes, tipos base e utilitários
│   ├── validation/   # Schemas de validação Zod
│   ├── domain/       # Entidades e regras centrais do domínio
│   ├── database/     # Camada de banco de dados e repositórios
│   ├── messaging/    # Abstrações agnósticas de mensageria
│   ├── ai/           # Motores especializados de IA (Classificador, Extrator, Policy, Generator)
│   └── crm/          # Adapters para sincronização com CRMs externos
├── infra/
│   └── compose/      # Configurações de Docker Compose para dev local
├── docs/
│   └── relatorios/   # Mini-relatórios de cada etapa concluída
├── .github/
│   └── workflows/    # Pipeline de CI (Lint, Typecheck, Test, Build)
├── .env.example      # Variáveis de ambiente documentadas
└── tsconfig.base.json # Configuração base de TypeScript estrito
```

---

## 🚀 Como Iniciar Localmente

### Pré-requisitos

- **Node.js**: v20+ ou v24+ LTS
- **NPM**: v10+ ou v11+
- **Docker** e **Docker Compose**

### 1. Clonar e Instalar Dependências

```bash
git clone https://github.com/TALVAO/nexora.git
cd nexora
npm install
```

### 2. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo para `.env`:

```bash
cp .env.example .env
```

### 3. Iniciar Infraestrutura Local (Banco de Dados)

```bash
docker compose -f infra/compose/docker-compose.yml up -d
```

### 4. Executar em Modo de Desenvolvimento

Para rodar todos os serviços simultaneamente:

```bash
# Executar a API (porta 3001)
npm run dev:api

# Executar o Frontend Web (porta 3000)
npm run dev:web
```

Acesse:

- **Web App:** [http://localhost:3000](http://localhost:3000)
- **API Health Check:** [http://localhost:3001/health](http://localhost:3001/health)

---

## 🖥️ Rotas do Painel (apps/web)

`apps/web/src/app` organiza as telas do corretor em dois grupos de rotas:

- **`(auth)`** — tela pública de login (`/login`). Não existe auto-cadastro
  nesta etapa: contas do piloto são provisionadas manualmente no banco via
  Supabase Auth, uma por corretor.
- **`(app)`** — inbox, funil, agenda, imóveis, ficha do lead e configurações.
  `middleware.ts` exige sessão real do Supabase Auth: sem sessão, qualquer
  rota desse grupo redireciona para `/login`; com sessão ativa, `/login`
  redireciona para `/inbox`.

Para o login funcionar de verdade (contra um projeto Supabase real), defina em
`.env` as mesmas variáveis públicas já documentadas em `.env.example`:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
`NEXT_PUBLIC_API_URL`. Com os valores `placeholder-*` do exemplo, o cliente de
API e o middleware não conseguem validar nenhuma sessão.

---

## 🧪 Qualidade e Testes

O repositório possui regras estritas de qualidade:

```bash
# Checagem de tipos em todos os workspaces
npm run typecheck

# Execução de testes automatizados
npm run test

# Verificação de formatação e lint
npm run format:check

# Formatação automática de código
npm run format

# Build de produção de todos os apps e pacotes
npm run build
```

---

## 🔒 Princípios Invioláveis

1. **Multi-tenant por padrão:** Toda entidade comercial pertence estritamente a um `tenant_id`.
2. **PostgreSQL como fonte de verdade:** Estado comercial nunca depende unicamente de memória de IA ou workflows de terceiros.
3. **Idempotência em mensageria:** Garantia contra processamento duplicado de webhooks.
4. **Human Takeover Seguro:** Se a conversa for assumida por um humano, nenhuma resposta automática é disparada sem autorização.
5. **Stop Conditions de Follow-up:** Se o lead responder, o follow-up pendente é imediatamente cancelado.

---

## 📄 Licença

Proprietário. Todos os direitos reservados.
