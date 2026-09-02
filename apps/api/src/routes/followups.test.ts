import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { authHeaders, createAuthTestTenantRepo } from "../test-utils/auth.js";
import {
  FollowupRepository,
  LeadRepository,
  type FollowupJobRow,
  type FollowupSequenceRow,
} from "@nexora/database";
import { FollowupScheduler } from "@nexora/messaging";

describe("Follow-up Engine API Routes Integration (Etapa 6)", () => {
  let app: FastifyInstance;
  let followupRepo: FollowupRepository;
  let leadRepo: LeadRepository;
  let scheduler: FollowupScheduler;

  const testTenantId = "a0000000-0000-0000-0000-000000000001";
  const testLeadId = "lead-followup-api-123";

  const fakeJob: FollowupJobRow = {
    id: "job-api-1",
    tenant_id: testTenantId,
    lead_id: testLeadId,
    conversation_id: "conv-1",
    sequence_id: "qualification_abandoned",
    step_id: "step-1",
    scheduled_at: new Date(Date.now() + 3600000).toISOString(),
    status: "PENDING",
    attempts: 0,
    cancel_reason: null,
    blocked_reason: null,
    provider_message_id: null,
    locked_at: null,
    locked_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    executed_at: null,
  };

  const fakeSequence: FollowupSequenceRow = {
    id: "seq-1",
    tenant_id: testTenantId,
    name: "Qualificação Abandonada",
    trigger_type: "qualification_abandoned",
    status: "ACTIVE",
    channel: "WHATSAPP",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    followupRepo = new FollowupRepository();
    leadRepo = new LeadRepository();
    scheduler = new FollowupScheduler({ followupRepo, leadRepo });
    app = await buildApp({
      followupRepo,
      leadRepo,
      scheduler,
      tenantRepo: createAuthTestTenantRepo(),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/followups/jobs", () => {
    it("should list followup jobs", async () => {
      followupRepo.listJobs = async () => [fakeJob];

      const response = await app.inject({
        method: "GET",
        url: "/api/followups/jobs?status=PENDING",
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.jobs.length).toBe(1);
      expect(body.jobs[0].id).toBe("job-api-1");
    });
  });

  describe("POST /api/followups/jobs", () => {
    it("should schedule a new followup job", async () => {
      scheduler.scheduleJob = async () => fakeJob;

      const response = await app.inject({
        method: "POST",
        url: "/api/followups/jobs",
        headers: authHeaders(app),
        payload: {
          leadId: testLeadId,
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
          sequenceId: "qualification_abandoned",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.job.id).toBe("job-api-1");
    });

    it("should return 400 if required fields are missing", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/followups/jobs",
        headers: authHeaders(app),
        payload: {
          leadId: "",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/followups/jobs/:id/cancel", () => {
    it("should cancel a pending followup job", async () => {
      followupRepo.cancelJob = async () => true;

      const response = await app.inject({
        method: "POST",
        url: `/api/followups/jobs/job-api-1/cancel`,
        headers: authHeaders(app),
        payload: {
          reason: "Lead agendou visita por telefone",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
  });

  describe("POST /api/followups/process", () => {
    it("should trigger background queue processing", async () => {
      scheduler.processDueJobs = async () => ({
        processed: 2,
        sent: 1,
        cancelled: 1,
        blocked: 0,
        failed: 0,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/followups/process",
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.stats.processed).toBe(2);
      expect(body.stats.sent).toBe(1);
      expect(body.stats.cancelled).toBe(1);
    });
  });

  describe("GET /api/followups/sequences", () => {
    it("should return active followup sequences", async () => {
      followupRepo.listSequences = async () => [fakeSequence];

      const response = await app.inject({
        method: "GET",
        url: "/api/followups/sequences",
        headers: authHeaders(app),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.sequences.length).toBe(1);
      expect(body.sequences[0].trigger_type).toBe("qualification_abandoned");
    });
  });
});
