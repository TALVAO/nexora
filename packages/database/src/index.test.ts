import { describe, it, expect } from "vitest";
import type { DatabaseConfig } from "./index.js";

describe("@nexora/database", () => {
  it("should define valid DatabaseConfig structure", () => {
    const config: DatabaseConfig = {
      connectionString: "postgresql://postgres:postgres@localhost:5432/nexora_dev",
      maxConnections: 10,
    };

    expect(config.connectionString).toContain("nexora_dev");
    expect(config.maxConnections).toBe(10);
  });
});
