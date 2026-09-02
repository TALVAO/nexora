-- ==============================================================================
-- Nexora — SaaS Imobiliário
-- Migration 05: Procedência e validade da disponibilidade do imóvel
-- Etapa 15.1
-- ==============================================================================
--
-- PROBLEMA QUE ESTA MIGRATION RESOLVE
--
-- `properties.status` já diz SE o imóvel está disponível. Não diz nada sobre
-- QUANDO isso foi verificado nem POR QUEM. Consequência prática: o
-- `PropertyMatcher` trata `status = 'AVAILABLE'` como verdade eterna, e a IA
-- passa a afirmar disponibilidade sobre um dado que pode ter meses.
--
-- Afirmar disponibilidade errada é o pior erro comercial possível: o lead marca
-- visita para um imóvel já alugado. O §23 do CLAUDE.md proíbe exatamente isso.
--
-- SOLUÇÃO
--
-- Guardar a PROCEDÊNCIA do fato (origem + carimbo de tempo) e deixar a
-- conclusão ("posso afirmar?") ser calculada, nunca gravada — ver nota abaixo.
--
-- ------------------------------------------------------------------------------
-- DUAS DECISÕES QUE DIVERGEM DA LETRA DO PLANO (e por quê)
-- ------------------------------------------------------------------------------
--
-- 1. NÃO existe coluna `availability_status`.
--    `properties.status property_status` já é exatamente esse dado. Uma segunda
--    coluna de status criaria duas fontes de verdade para o mesmo fato, com
--    divergência garantida no primeiro UPDATE que esquecesse uma das duas. O
--    §9 e a prioridade 1 do §49 (integridade de dados) mandam o contrário.
--
-- 2. NÃO existe coluna `availability_confidence`.
--    Confiança é função do TEMPO: o mesmo registro é confiável hoje e duvidoso
--    em três semanas, sem que nenhum UPDATE aconteça. Um número gravado em
--    disco não decai sozinho — ficaria dizendo "alta confiança" sobre um dado
--    podre, que é precisamente o erro que esta etapa existe para impedir.
--    O banco guarda os FATOS (origem + quando); a confiança é derivada em
--    `packages/domain/src/availability.ts`, com o TTL do tenant.
--
--    Ambas as decisões são aditivas em relação ao plano: se depois houver
--    motivo real para materializar qualquer uma delas, é uma migration nova.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Tipos
-- ------------------------------------------------------------------------------
DO $types$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'availability_source') THEN
    -- De onde veio a última afirmação sobre a disponibilidade deste imóvel.
    --   MANUAL          — cadastro/edição feita por uma pessoa no sistema.
    --   XML_FEED        — importação de feed do padrão de mercado (Etapa 15.2).
    --   CRM_API         — sincronização com o CRM da operação (Fase 10).
    --   AGENT_CONFIRMED — o corretor respondeu "está disponível" quando o
    --                     sistema perguntou (Availability Check Loop, 15.3).
    CREATE TYPE availability_source AS ENUM (
      'MANUAL',
      'XML_FEED',
      'CRM_API',
      'AGENT_CONFIRMED'
    );
  END IF;
END
$types$;

-- ------------------------------------------------------------------------------
-- 2. Procedência no imóvel
-- ------------------------------------------------------------------------------
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS availability_source availability_source NOT NULL DEFAULT 'MANUAL';

-- NULL de propósito, e sem backfill.
--
-- As linhas que já existem foram cadastradas sem que ninguém registrasse quando
-- a disponibilidade foi conferida. Preencher com `created_at` seria inventar uma
-- verificação que nunca houve (§22). NULL significa "nunca verificado", que é a
-- verdade — e faz a IA hedgear sobre o catálogo legado até alguém confirmar,
-- que é o comportamento correto.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS availability_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN properties.availability_verified_at IS
  'Quando a disponibilidade foi afirmada pela última vez. NULL = nunca verificada; a IA não pode afirmar disponibilidade.';

-- ------------------------------------------------------------------------------
-- 3. Política de validade POR TENANT
-- ------------------------------------------------------------------------------
--
-- Uma imobiliária de alto giro precisa reconfirmar mais rápido que um corretor
-- com carteira estável. O prazo é configuração do tenant, não constante de
-- código (§10).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS availability_fresh_hours INTEGER NOT NULL DEFAULT 24;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS availability_stale_hours INTEGER NOT NULL DEFAULT 168; -- 7 dias

COMMENT ON COLUMN tenants.availability_fresh_hours IS
  'Até esta idade (horas) a verificação é considerada fresca e a IA pode afirmar disponibilidade.';
COMMENT ON COLUMN tenants.availability_stale_hours IS
  'Acima desta idade (horas) a verificação é considerada vencida e o imóvel precisa ser reconfirmado.';

-- Prazos invertidos (fresco > vencido) produziriam uma faixa impossível e um
-- comportamento silenciosamente errado. Falhar no INSERT é melhor.
DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tenant_availability_window'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT chk_tenant_availability_window
      CHECK (
        availability_fresh_hours > 0
        AND availability_stale_hours >= availability_fresh_hours
      );
  END IF;
END
$chk$;

-- ------------------------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------------------------
-- Nenhuma tabela nova foi criada: `properties` e `tenants` já têm ENABLE +
-- FORCE ROW LEVEL SECURITY e policies desde a migration 03, e colunas herdam a
-- proteção da tabela. Os GRANTs para `nexora_app` também são por tabela, então
-- nada precisa ser reconcedido aqui.
