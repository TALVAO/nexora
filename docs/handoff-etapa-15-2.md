# Handoff — Etapa 15.2 (Importador VRSync)

**Data:** 02/09/2026
**Estado:** implementação COMPLETA e verde no gate; faltam 3 correções de fidelidade ao formato, validação Zod, `memoria.md` e 3 dimensões de revisão que não rodaram.

Quem pegar este documento consegue fechar a etapa sem precisar do histórico da conversa.

---

## 0. Contexto mínimo do projeto

**Nexora** — SaaS imobiliário multi-tenant (CRM + IA conversacional + follow-up).
Monorepo npm workspaces, TypeScript estrito, Fastify + Next.js 14 + PostgreSQL.

**Caminho do worktree (é onde o código está, NÃO o repo principal):**

```
C:\Users\tavim\Desktop\Projetos\Nexora\.claude\worktrees\crm-real-estate-evolution-936f51
```

Branch: `claude/crm-real-estate-evolution-936f51`

**Leia antes de tocar em qualquer coisa:**

1. `CLAUDE.md` (raiz) — regras de comportamento. As que mais importam aqui:
   - §2 simplicidade, §3 mudanças cirúrgicas
   - §5 implementar SOMENTE a etapa atual
   - §22 **nunca inventar dado** — sem informação ⇒ `null`
   - §10 vocabulário de imóvel é do mercado brasileiro (pode ter padrão em código); geografia é do tenant (não pode)
   - §39 validar fronteira externa com Zod
2. `memoria.md` — histórico vivo. Está atualizado até a **Etapa 15.1**.
3. `.claude/plans/claude-veja-que-este-functional-umbrella.md` — plano das Fases 13→20.

**Protocolo de trabalho em vigor (importante):** uma etapa por vez, nunca avançar sozinho, e ao terminar entregar um mini-relatório fixo e PARAR aguardando OK do usuário. O formato está no fim do plano, seção "Protocolo de execução".

---

## 1. O que a Etapa 15.2 já entregou (está no disco, verde)

Objetivo da etapa, segundo o plano: *"Parser do XML padrão ZAP/VivaReal/OLX + tela de importação"*.

### Arquivos NOVOS

| Arquivo | O que é |
| --- | --- |
| `packages/messaging/src/catalog/vrsync-importer.ts` | `VrSyncPropertyImporter.parseXml()` — converte feed VRSync em `CreatePropertyInput[]` |
| `packages/messaging/src/tests/vrsync-importer.test.ts` | 16 testes do parser |

### Arquivos MODIFICADOS

| Arquivo | Mudança |
| --- | --- |
| `packages/messaging/package.json` | + dependência `fast-xml-parser@5.11.1` (pin exato) |
| `packages/messaging/src/index.ts` | + `export * from "./catalog/vrsync-importer.js"` |
| `apps/api/src/routes/properties.ts` | + rota `POST /api/properties/import-vrsync`; + opção `vrsyncImporter` |
| `apps/api/src/app.ts` | + `VrSyncPropertyImporter` no import, em `AppOptions` e no registro do plugin |
| `apps/api/src/routes/properties.test.ts` | + 5 testes da rota nova |
| `apps/web/src/lib/api.ts` | + `importPropertiesVrSync()`, `importPropertiesCsv()`, tipos `ImportPropertiesResult`/`SkippedListing` |
| `apps/web/src/lib/api.test.ts` | + 2 testes |
| `apps/web/src/app/(app)/imoveis/page.tsx` | placeholder → tela de importação real (VRSync + CSV, upload de arquivo, resultado com ignorados) |

### Decisões de mapeamento já tomadas (documentadas em comentário no próprio parser)

- `TransactionType`: `"For Sale"`→`BUY`, `"For Rent"`→`RENT`, `"Sale/Rent"`→`RENT_OR_BUY`.
- **Preço em `Sale/Rent`**: prefere `RentalPrice`, cai para `ListPrice` — locação é a prioridade do MVP (§1).
- `PropertyType` `"Residential / Apartment"` → guarda `"Apartment"` (texto após a última barra). Não traduz nem restringe a lista fixa.
- `petsAllowed` sempre `null` — VRSync não tem campo de pet; inferir de `Features` (texto livre) violaria §22.
- `availabilitySource: "XML_FEED"` — integra com a Etapa 15.1: importar é a afirmação de disponibilidade daquele instante, e o `PropertyRepository` carimba `availability_verified_at`.
- Listing incompleto **não é descartado em silêncio**: volta em `skipped[]` com motivo em pt-BR. O importador CSV descarta calado — comportamento pré-existente, não mexido.
- `Features` (piscina, academia) **não** é importado: não há campo em `CreatePropertyInput` e criar um seria especulativo (§2).

### Segurança já verificada rodando de verdade, não assumindo

- **XXE**: `fast-xml-parser` recusa entidade externa — retorna `External entities are not supported`.
- **Billion-laughs**: entidade interna não é expandida, volta como texto literal `&lol2;`.
- Rota é `access: tenant` por padrão (fail closed); VIEWER já é bloqueado em métodos de escrita pelo plugin de auth — não precisou de regra nova.
- `tenantId` vem do JWT via `tenantContext(request)`, nunca do corpo da requisição.

### Gate §7 no estado atual

```
typecheck ✓   build ✓ (inclui next build; /imoveis gerada)
test      ✓ 332 testes, 0 falhas, 0 pulados (com Postgres real no ar)
lint      ✗ sem config de ESLint no repo — nona etapa consecutiva, pendência antiga
```

Antes da etapa eram 309 testes; +23 (16 parser + 5 rota + 2 api.ts).

---

## 2. O QUE FALTA — é isto que você vai aplicar

### 2.1 Três achados de fidelidade ao formato (NÃO verificados adversarialmente)

Rodei uma revisão adversarial multi-agente. **Só 1 das 4 dimensões terminou** — as outras 3 e todos os verificadores morreram por limite de sessão. Então os achados abaixo são **plausíveis mas sem segunda opinião**. Confirme na doc oficial antes de mexer.

Fonte oficial: `https://developers.grupozap.com/feeds/vrsync/elements/details.html`

---

#### ACHADO 1 — `RentalPrice period` ignorado

**Severidade média · o atributo eu confirmo que existe** (vi na doc oficial nesta sessão).

`packages/messaging/src/catalog/vrsync-importer.ts:185`

`RentalPrice` tem atributo oficial `period` (`Monthly` | `Daily` | `Weekly` | `Quarterly` | `Yearly`, default `Monthly`). O parser lê só o número e trata tudo como mensal.

Falha real: `<RentalPrice currency="BRL" period="Daily">150</RentalPrice>` (temporada, canal que o ZAP atende) entra no catálogo como aluguel de R$ 150/mês. Preço absurdo, sem nenhum aviso.

**Correção recomendada — é decisão de produto, confirme antes:** NÃO converter. Multiplicar por 30 seria inventar dado (§22). Importar apenas `period` ausente ou `Monthly`; qualquer outro valor vai para `skipped[]` com motivo claro, por exemplo:

```
"RentalPrice com period=Daily não é suportado (o catálogo trabalha com aluguel mensal)."
```

O mecanismo de `skipped` já existe e a tela já mostra.

---

#### ACHADO 2 — `Warranty` provavelmente é enum em inglês

**Severidade média · NÃO confirmei os valores literais.**

`packages/messaging/src/catalog/vrsync-importer.ts:197`

O agente afirma que `<Warranty>` usa enum fixo: `SECURITY_DEPOSIT`, `GUARANTOR`, `INSURANCE_GUARANTEE`, `GUARANTEE_LETTER`, `CAPITALIZATION_BONDS`. O parser hoje copia o texto cru para `rentalGuarantees`.

Falha real: feed com `GUARANTOR` grava `["GUARANTOR"]`, que nunca casa com o vocabulário canônico do sistema — a garantia locatícia some para matching e para a IA.

**Primeiro passo: CONFIRME os valores literais na doc.** Se confirmado, mapeie para o catálogo canônico que já existe em `packages/shared/src/vocabulary.ts` (`DEFAULT_RENTAL_GUARANTEES`, linha ~99):

| VRSync | Canônico existente |
| --- | --- |
| `SECURITY_DEPOSIT` | `Caução` |
| `GUARANTOR` | `Fiador` |
| `INSURANCE_GUARANTEE` | `Seguro Fiança` |
| `CAPITALIZATION_BONDS` | `Título de Capitalização` |
| `GUARANTEE_LETTER` | **não existe no catálogo** — decidir: adicionar "Carta de Fiança" ou manter cru |

Isso é legítimo pelo §10: garantia locatícia é vocabulário do mercado brasileiro, não do cliente zero — o cabeçalho do `vocabulary.ts` diz exatamente isso. Valor desconhecido ou fora do enum: mantenha cru em vez de descartar, para não perder dado.

---

#### ACHADO 3 — fixture de teste usa valores irreais

**Severidade baixa · consequência direta do Achado 2.**

`packages/messaging/src/tests/vrsync-importer.test.ts:108`

O teste usa `<Warranty>Caução</Warranty>` e `<Warranty>Fiador</Warranty>`. Se o enum oficial for mesmo em inglês, esse fixture testa um formato que nenhum gerador real produz — e o comentário no topo do arquivo afirma que os exemplos espelham a doc oficial. Ou seja: **o comentário estaria mentindo**. Corrija o fixture junto com o Achado 2.

---

### 2.2 Validação Zod na rota (§39) — provável correção real

A rota `import-vrsync` **não valida o corpo com Zod**, só faz `if (!xmlContent)`. As rotas de vocabulário da Etapa 13.3 ganharam Zod exatamente por isso (lá, entrada inválida devolvia 500 com a mensagem interna do Postgres no corpo). Vale alinhar.

### 2.3 Três dimensões de revisão que NUNCA rodaram

Morreram por limite de sessão. Se quiser a etapa realmente auditada:

1. **Segurança** — limite de tamanho de corpo da requisição no Fastify (um XML de 500 MB derruba o processo?), vazamento de detalhe interno na mensagem de erro 400/500. *XXE e billion-laughs eu já testei; estão OK.*
2. **Conformidade com CLAUDE.md** — o item Zod acima é o candidato mais provável.
3. **Casos de borda do parser** — preço com `"R$ 2.500,00"`, BOM no início do arquivo, `ListingID` duplicado, dois `Media/Item` com `primary="true"`, `RentalPrice` zero ou negativo (hoje `!price` trata 0 como ausente — provavelmente correto, confirme), capitalização de `TransactionType`.

### 2.4 `memoria.md` NÃO foi atualizado

**Obrigatório pelo protocolo do projeto.** Rascunho pronto para colar logo após a seção da Etapa 15.1, antes de `# 2. Contexto confirmado`:

```markdown
### Etapa 15.2 — Importador VRSync [CONCLUÍDA — 02/09/2026]

**Por que VRSync:** é o padrão XML que o Grupo OLX exige desde que o formato antigo
foi descontinuado (out/2024). Toda imobiliária brasileira já GERA esse arquivo para
alimentar ZAP/VivaReal/OLX — aceitar VRSync é poder dizer "importo seu catálogo em
5 minutos" numa reunião de venda, sem esperar a Etapa 15.4 (descoberta do CRM).

**O que passou a valer:**

- `packages/messaging/src/catalog/vrsync-importer.ts` — `VrSyncPropertyImporter`,
  usando `fast-xml-parser` 5.11.1 (pin exato). Estrutura confirmada na documentação
  oficial em 01/09/2026, não deduzida.
- `POST /api/properties/import-vrsync` — devolve `importedCount`, `skippedCount` e
  `skipped[]` com motivo em pt-BR. XML malformado dá **400, não 500**, e não chega a
  tocar o banco.
- Tela `/imoveis` deixou de ser placeholder: importação VRSync + CSV com upload de
  arquivo e resultado explícito, incluindo o que foi ignorado.
- Integra com a Etapa 15.1: importar carimba `availability_source = XML_FEED` e
  `availability_verified_at = now()` — importar É a afirmação de disponibilidade.

**Decisões de mapeamento:**

| Situação | Decisão | Motivo |
| --- | --- | --- |
| `Sale/Rent` com os dois preços | usa `RentalPrice` | locação é a prioridade do MVP (§1) |
| campo de pet | sempre `null` | VRSync não tem campo dedicado; inferir de `Features` (texto livre) violaria §22 |
| `Features` (piscina, academia) | não importado | não há campo em `CreatePropertyInput`; criar seria especulativo (§2) |
| listing incompleto | vai para `skipped[]` com motivo | é arquivo de terceiro, não algo que o corretor digitou — ele precisa saber o que faltou |

**Segurança verificada rodando, não assumindo:** `fast-xml-parser` recusa entidade
externa (XXE) e não expande entidade interna (billion-laughs). Tenant vem do JWT;
VIEWER já é barrado em escrita pelo plugin de auth.

**Testes: 332 passando (+23), 0 pulados, com Postgres real.**

**Pendências abertas:**

| Item | Destino |
| --- | --- |
| Reimportar o mesmo feed duplica imóveis: não há upsert por `external_id` | comportamento pré-existente do importador CSV; decidir quando houver reimportação periódica |
| Sem limite de tamanho de corpo para importação | mesmo estado do import-csv; revisar no deploy |
| `npm run lint` segue quebrado | nona etapa consecutiva |
```

Ajuste os números e acrescente ao rascunho o que você mesmo corrigir (period, Warranty, Zod). Confira a contagem de arquivos de teste rodando a suíte — eu contei 332 testes mas não conferi o total de arquivos.

---

## 3. Como verificar (comandos exatos)

```bash
cd "C:/Users/tavim/Desktop/Projetos/Nexora/.claude/worktrees/crm-real-estate-evolution-936f51"

# O Docker Desktop deste ambiente está QUEBRADO (erro de npipe).
# O caminho que funciona é o Postgres nativo no WSL — ele PARA SOZINHO entre
# comandos, então inicie imediatamente antes de rodar os testes:
wsl -d Ubuntu -u root -- service postgresql start

npm run typecheck
npm run build
npm run test
```

Testes só do que a etapa mexeu:

```bash
npx vitest run --root packages/messaging src/tests/vrsync-importer.test.ts
npx vitest run --root apps/api src/routes/properties.test.ts
npm run test --workspace=@nexora/web
```

**Importante:** depois de mexer em `packages/messaging`, rode `npm run build --workspace=@nexora/messaging` antes do typecheck de `apps/api` — os workspaces resolvem uns aos outros pelo `dist/`, não pelo `src/`. Isso já mordeu nesta sessão.

---

## 4. Armadilhas conhecidas deste repositório

1. **Código escrito contra schema assumido.** As Etapas 13.3, 14.2 e 14.3 tiveram bugs de SQL que passaram em TODOS os testes porque os unitários dublavam `query()`. Só quebravam contra Postgres real. Se mexer em repositório, teste contra banco de verdade.
2. **Docker Desktop não sobe** neste ambiente (erro de npipe). Use o WSL como acima.
3. **`npm run lint` nunca funcionou** — não existe config de ESLint. Não é regressão sua.
4. **`addActivity` está quebrado** (colunas/enum divergentes do schema real de `activities`), mascarado por `try/catch` em vários pontos. Pendência antiga, fora do escopo desta etapa.
5. **Sem credenciais Supabase reais** aqui, então `/imoveis` só pôde ser verificada até o redirect para `/login`. Eu confirmei: o middleware protege a rota, `/login` renderiza sem erro de console, e `next build` gera `/imoveis`. A tela em si, com sessão real, **não foi vista funcionando por ninguém ainda**.

---

## 5. Ordem sugerida

1. Confirmar Achados 1 e 2 na doc oficial do VRSync.
2. Corrigir `period` + teste provando que `period="Daily"` cai em `skipped`.
3. Corrigir `Warranty` + o fixture do Achado 3 + teste com o enum real.
4. Adicionar Zod na rota `import-vrsync` (§39) + teste de corpo inválido.
5. Rodar as 3 dimensões de revisão que faltaram.
6. Gate completo com Postgres no ar.
7. Escrever a seção no `memoria.md` (rascunho acima), ajustando o que mudou.
8. Entregar o mini-relatório do protocolo e PARAR.

**Próxima etapa depois desta:** 15.3 — Availability Check Loop. É o diferencial de verdade da fase: a IA pergunta a disponibilidade ao corretor pelo WhatsApp, ele toca um botão, e a IA destrava e responde ao lead. O plano pede **Claude Opus 5 / esforço Max** — é a etapa mais sensível da Fase 15.
