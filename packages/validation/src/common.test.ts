import { describe, it, expect } from "vitest";
import { uuidSchema, stageSchema, paginationSchema } from "./common.js";

describe("Validation Schemas", () => {
  it("should validate valid UUIDs", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(uuidSchema.safeParse(validUuid).success).toBe(true);
  });

  it("should reject invalid UUIDs", () => {
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("should validate correct stages", () => {
    expect(stageSchema.safeParse("NEW").success).toBe(true);
    expect(stageSchema.safeParse("QUALIFIED").success).toBe(true);
    expect(stageSchema.safeParse("INVALID_STAGE").success).toBe(false);
  });

  it("should parse and default pagination query", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});
