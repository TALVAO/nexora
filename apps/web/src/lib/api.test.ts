import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Substitui o cliente Supabase do browser por uma versão controlada: cada
 * teste decide, via `getSessionMock`, se existe sessão (e com qual token).
 */
const getSessionMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: getSessionMock,
    },
  }),
}));

const { ApiError, getDashboardMetrics, listLeads, importPropertiesVrSync, importPropertiesCsv } =
  await import("@/lib/api");

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;

function mockFetchResponse(options: { ok: boolean; status: number; body: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: options.ok,
    status: options.status,
    json: () => Promise.resolve(options.body),
  } as unknown as Response);
}

function authHeader(fetchMock: ReturnType<typeof vi.fn>): string | undefined {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe("lib/api", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.test.local";
    getSessionMock.mockReset();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
    vi.unstubAllGlobals();
  });

  it("inclui o header Authorization com o token de acesso quando existe sessão", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token-abc-123" } } });
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 200,
      body: { success: true, leads: [], total: 0 },
    });
    vi.stubGlobal("fetch", fetchMock);

    await listLeads();

    expect(authHeader(fetchMock)).toBe("Bearer token-abc-123");
  });

  it("não inclui o header Authorization quando não existe sessão", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 200,
      body: { success: true, leads: [], total: 0 },
    });
    vi.stubGlobal("fetch", fetchMock);

    await listLeads();

    expect(authHeader(fetchMock)).toBeUndefined();
  });

  it("retorna o dado da rota numa chamada bem-sucedida", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const metrics = {
      totalLeads: 5,
      leadsByStage: { NEW: 5 },
      leadsByTemperature: { COLD: 5 },
      leadsByAutomation: { AI: 5 },
      activeConversations: 2,
      scheduledVisits: 1,
    };
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 200,
      body: { success: true, metrics },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDashboardMetrics();

    expect(result).toEqual(metrics);
  });

  it("lança ApiError com a mensagem e o status da resposta em caso de falha", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = mockFetchResponse({
      ok: false,
      status: 401,
      body: { success: false, error: "Token inválido." },
    });
    vi.stubGlobal("fetch", fetchMock);

    const failure = await listLeads().then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as InstanceType<typeof ApiError>).status).toBe(401);
    expect((failure as InstanceType<typeof ApiError>).message).toBe("Token inválido.");
  });

  // ---------------------------------------------------------------------------
  // Etapa 15.2 — importação de catálogo
  // ---------------------------------------------------------------------------
  it("importPropertiesVrSync envia xmlContent e devolve importados + ignorados", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 200,
      body: {
        success: true,
        importedCount: 2,
        skippedCount: 1,
        skipped: [{ listingId: "X1", reason: "Nenhum preço válido encontrado." }],
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await importPropertiesVrSync("<ListingDataFeed></ListingDataFeed>");

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("https://api.test.local/api/properties/import-vrsync");
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      xmlContent: "<ListingDataFeed></ListingDataFeed>",
    });
    expect(result).toEqual({
      importedCount: 2,
      skippedCount: 1,
      skipped: [{ listingId: "X1", reason: "Nenhum preço válido encontrado." }],
    });
  });

  it("importPropertiesCsv envia csvContent e devolve a contagem importada", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const fetchMock = mockFetchResponse({
      ok: true,
      status: 200,
      body: { success: true, importedCount: 3 },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await importPropertiesCsv("title,city,price\nApto,Recife,2000");

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("https://api.test.local/api/properties/import-csv");
    expect(result).toEqual({ importedCount: 3 });
  });
});
