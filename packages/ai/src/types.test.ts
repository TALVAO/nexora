import { describe, it, expect } from "vitest";
import type { LeadIntent, ExtractedLeadProfile } from "./types.js";

describe("@nexora/ai", () => {
  it("should define valid AI contract structures", () => {
    const intent: LeadIntent = "RENTAL_SEARCH";
    const profile: ExtractedLeadProfile = {
      transactionType: "RENT",
      city: "Jundiaí",
      neighborhoods: ["Eloy Chaves"],
      maxBudget: 3500,
      bedrooms: 2,
      parkingSpaces: 1,
      hasPet: true,
      moveDate: null,
      rentalGuarantee: null,
      notes: null,
    };

    expect(intent).toBe("RENTAL_SEARCH");
    expect(profile.transactionType).toBe("RENT");
    expect(profile.maxBudget).toBe(3500);
  });
});
