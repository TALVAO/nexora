"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import {
  ApiError,
  importPropertiesCsv,
  importPropertiesVrSync,
  type ImportPropertiesResult,
} from "@/lib/api";

type ImportFormat = "vrsync" | "csv";

const FORMATS: Array<{ id: ImportFormat; label: string; hint: string; accept: string }> = [
  {
    id: "vrsync",
    label: "VRSync (XML)",
    hint: "O mesmo arquivo que você já gera para ZAP, VivaReal ou OLX.",
    accept: ".xml,text/xml,application/xml",
  },
  {
    id: "csv",
    label: "Planilha (CSV)",
    hint: "Colunas: title, transaction_type, city, price e outras opcionais.",
    accept: ".csv,text/csv",
  },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Não foi possível importar o arquivo. Verifique sua conexão e tente novamente.";
}

/**
 * Catálogo de imóveis (Etapa 15.2): por enquanto, só a importação em lote —
 * cadastro individual e listagem ficam para quando o Plano Mestre pedir
 * (esta etapa é só "Importador VRSync + tela de importação", não o CRUD
 * completo do catálogo). Aceita VRSync (o padrão que toda imobiliária
 * brasileira já gera para os portais) e o CSV que já existia desde a Etapa 8.
 */
export default function ImoveisPage() {
  const [format, setFormat] = useState<ImportFormat>("vrsync");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation<ImportPropertiesResult, unknown, string>({
    mutationFn: (content) =>
      format === "vrsync" ? importPropertiesVrSync(content) : importPropertiesCsv(content),
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    importMutation.reset();

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      if (content) {
        importMutation.mutate(content);
      }
    };
    reader.readAsText(file);
  }

  function handleFormatChange(next: ImportFormat) {
    setFormat(next);
    setFileName(null);
    importMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const activeFormat = FORMATS.find((f) => f.id === format)!;
  const result = importMutation.data;

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-semibold text-foreground">Catálogo de imóveis</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Importe seu catálogo em lote. Disponibilidade rastreável a partir daqui.
      </p>

      <div className="mt-5 max-w-lg rounded-2xl border border-surface-border bg-surface p-5">
        <div className="flex gap-2" role="tablist" aria-label="Formato do arquivo">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={format === f.id}
              onClick={() => handleFormatChange(f.id)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                format === f.id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-surface-border text-foreground/60 hover:bg-surface-subtle"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-foreground/50">{activeFormat.hint}</p>

        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-surface-border px-4 py-8 text-center hover:bg-surface-subtle">
          <Upload className="h-5 w-5 text-foreground/40" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            {fileName ?? `Escolher arquivo ${activeFormat.label}`}
          </span>
          <span className="text-xs text-foreground/40">Toque para selecionar</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={activeFormat.accept}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        {importMutation.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-foreground/60">
            <FileUp className="h-4 w-4 animate-pulse" aria-hidden="true" />
            Importando catálogo...
          </p>
        ) : null}

        {importMutation.isError ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <p className="text-sm text-red-600">{errorMessage(importMutation.error)}</p>
          </div>
        ) : null}

        {result ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
              <p className="text-sm text-green-700">
                {result.importedCount === 1
                  ? "1 imóvel importado."
                  : `${result.importedCount} imóveis importados.`}
              </p>
            </div>

            {result.skippedCount ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-700">
                  {result.skippedCount === 1
                    ? "1 item do arquivo foi ignorado:"
                    : `${result.skippedCount} itens do arquivo foram ignorados:`}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {(result.skipped ?? []).map((item, index) => (
                    <li key={item.listingId ?? index} className="text-xs text-amber-700/80">
                      {item.listingId ? `${item.listingId}: ` : ""}
                      {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
