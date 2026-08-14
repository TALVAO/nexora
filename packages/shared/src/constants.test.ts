import { describe, it, expect } from "vitest";
import { APP_NAME, STAGES, ROLES } from "./constants.js";

describe("Shared Constants", () => {
  it("should have correct APP_NAME", () => {
    expect(APP_NAME).toBe("Nexora");
  });

  it("should contain all expected stages", () => {
    expect(STAGES).toContain("NEW");
    expect(STAGES).toContain("QUALIFIED");
    expect(STAGES).toContain("WON");
    expect(STAGES).toContain("LOST");
  });

  it("should contain expected base roles", () => {
    expect(ROLES).toEqual(["OWNER", "MANAGER", "AGENT", "VIEWER"]);
  });
});
