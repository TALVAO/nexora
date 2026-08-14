import { describe, it, expect } from "vitest";
import type { Role } from "@nexora/shared";

// Role hierarchy checker reflecting Migration 02 RLS rules
export function canManageTenant(role: Role): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function canModifyLeads(role: Role): boolean {
  return role === "OWNER" || role === "MANAGER" || role === "AGENT";
}

export function canOnlyView(role: Role): boolean {
  return role === "VIEWER";
}

describe("Role-Based Access Control (RBAC) Policies", () => {
  it("should allow OWNER and MANAGER to manage tenant settings and members", () => {
    expect(canManageTenant("OWNER")).toBe(true);
    expect(canManageTenant("MANAGER")).toBe(true);
  });

  it("should prevent AGENT and VIEWER from managing tenant settings and members", () => {
    expect(canManageTenant("AGENT")).toBe(false);
    expect(canManageTenant("VIEWER")).toBe(false);
  });

  it("should allow OWNER, MANAGER and AGENT to create/update leads", () => {
    expect(canModifyLeads("OWNER")).toBe(true);
    expect(canModifyLeads("MANAGER")).toBe(true);
    expect(canModifyLeads("AGENT")).toBe(true);
  });

  it("should restrict VIEWER to read-only operations", () => {
    expect(canModifyLeads("VIEWER")).toBe(false);
    expect(canOnlyView("VIEWER")).toBe(true);
  });
});
