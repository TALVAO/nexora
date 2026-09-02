#!/usr/bin/env node
/**
 * Sobe um PostgreSQL descartável e aplica as migrations na ordem correta,
 * para que o teste de integração de RLS possa rodar.
 *
 * Porta 55432 de propósito: a 5432 costuma estar ocupada por outro projeto.
 *
 * Uso:  npm run db:test:up
 *       npm run db:test:down
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "nexora-test-db";
const PORT = "55432";
const DB = "nexora_test";

// A migration 03 cria o shim de `auth` e as roles do Supabase que a 02
// referencia — por isso ela roda ANTES da 02 em PostgreSQL puro.
const MIGRATIONS = [
  "supabase/migrations/20260814000001_initial_schema.sql",
  "supabase/migrations/20260822000003_rls_app_role.sql",
  "supabase/migrations/20260814000002_multi_tenant_rls.sql",
  "supabase/migrations/20260822000004_tenant_vocabulary.sql",
  "supabase/migrations/20260901000005_property_availability_provenance.sql",
];

function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: "pipe", ...options });
}

function containerState() {
  try {
    return docker(["inspect", "-f", "{{.State.Status}}", CONTAINER]).trim();
  } catch {
    return "absent";
  }
}

function waitForReady(attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const probe = spawnSync(
      "docker",
      ["exec", CONTAINER, "pg_isready", "-U", "postgres", "-d", DB],
      {
        stdio: "pipe",
      },
    );
    if (probe.status === 0) return;
    execFileSync(process.execPath, ["-e", "setTimeout(()=>{},1000)"]);
  }
  throw new Error(`${CONTAINER} não ficou pronto a tempo.`);
}

const state = containerState();

if (state === "absent") {
  console.log(`[db:test] criando container ${CONTAINER} na porta ${PORT}...`);
  docker([
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-e",
    "POSTGRES_USER=postgres",
    "-e",
    "POSTGRES_PASSWORD=postgrespassword",
    "-e",
    `POSTGRES_DB=${DB}`,
    "-p",
    `${PORT}:5432`,
    "postgres:16-alpine",
  ]);
} else if (state !== "running") {
  console.log(`[db:test] iniciando container ${CONTAINER} (estado: ${state})...`);
  docker(["start", CONTAINER]);
} else {
  console.log(`[db:test] container ${CONTAINER} já está rodando.`);
}

waitForReady();

// Banco limpo a cada execução: migrations idempotentes ainda assim se
// beneficiam de um estado previsível.
console.log("[db:test] recriando o banco...");
spawnSync(
  "docker",
  ["exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS ${DB};`],
  { stdio: "pipe" },
);
spawnSync("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE ${DB};`], {
  stdio: "pipe",
});

for (const file of MIGRATIONS) {
  const sql = readFileSync(join(ROOT, file), "utf8");
  const result = spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", DB, "-q", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    console.error(`[db:test] FALHOU em ${file}:\n${result.stderr}`);
    process.exit(1);
  }
  console.log(`[db:test] aplicada  ${file}`);
}

console.log(
  `\n[db:test] pronto.\n` +
    `  TEST_DATABASE_URL=postgresql://postgres:postgrespassword@localhost:${PORT}/${DB}\n` +
    `  Rode:  npm run test --workspace=@nexora/database\n`,
);
