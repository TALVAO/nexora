import { describe, it, expect, vi } from "vitest";
import { LeadRepository } from "../repositories/lead.repository.js";
import type { LeadRow } from "../types.js";

describe("Cross-Channel Lead Identity Resolution (Etapa 9)", () => {
  const leadRepo = new LeadRepository();
  const testTenantId = "a0000000-0000-0000-0000-000000000001";

  const instagramLead: LeadRow = {
    id: "lead-ig-100",
    tenant_id: testTenantId,
    assigned_user_id: null,
    name: "Ana Clara",
    phone: null,
    instagram_user_id: "anaclara_imoveis",
    email: null,
    source: "INSTAGRAM",
    intent: "RENTAL_SEARCH",
    stage: "QUALIFYING",
    temperature: "WARM",
    score: 65,
    automation_mode: "AI",
    first_contact_at: new Date().toISOString(),
    last_inbound_at: new Date().toISOString(),
    last_outbound_at: new Date().toISOString(),
    next_action_at: null,
    lost_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const whatsappLead: LeadRow = {
    id: "lead-wa-200",
    tenant_id: testTenantId,
    assigned_user_id: null,
    name: null,
    phone: "5511999991111",
    instagram_user_id: null,
    email: "anaclara@email.com",
    source: "WHATSAPP",
    intent: "RENTAL_SEARCH",
    stage: "QUALIFIED",
    temperature: "HOT",
    score: 85,
    automation_mode: "AI",
    first_contact_at: new Date().toISOString(),
    last_inbound_at: new Date().toISOString(),
    last_outbound_at: new Date().toISOString(),
    next_action_at: null,
    lost_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // ----------------------------------------------------------------------------
  // CRITICAL REQUIREMENT (Teste importante Seção 63):
  // "Lead começa no Instagram e depois aparece no WhatsApp.
  // O sistema deverá permitir futura unificação de identidade sem sobrescrever dados automaticamente."
  // ----------------------------------------------------------------------------
  it("should link phone number to an Instagram lead without overwriting Instagram identity", async () => {
    leadRepo.linkIdentity = vi.fn().mockResolvedValue({
      ...instagramLead,
      phone: "5511999991111",
    });

    const linked = await leadRepo.linkIdentity({ tenantId: testTenantId }, instagramLead.id, {
      phone: "5511999991111",
    });

    expect(linked?.instagram_user_id).toBe("anaclara_imoveis");
    expect(linked?.phone).toBe("5511999991111");
    expect(linked?.source).toBe("INSTAGRAM");
  });

  it("should merge WhatsApp and Instagram leads into a unified lead preserving all channel contact points", async () => {
    leadRepo.mergeLeads = vi.fn().mockResolvedValue({
      ...whatsappLead,
      name: "Ana Clara",
      instagram_user_id: "anaclara_imoveis",
      phone: "5511999991111",
      email: "anaclara@email.com",
    });

    const unified = await leadRepo.mergeLeads(
      { tenantId: testTenantId },
      whatsappLead.id,
      instagramLead.id,
    );

    expect(unified?.id).toBe(whatsappLead.id);
    expect(unified?.instagram_user_id).toBe("anaclara_imoveis");
    expect(unified?.phone).toBe("5511999991111");
    expect(unified?.name).toBe("Ana Clara");
    expect(unified?.email).toBe("anaclara@email.com");
  });
});
