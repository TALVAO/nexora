import { assertTenantContext, type TenantContext } from "../context.js";
import { query } from "../client.js";
import type { PropertyRow } from "../types.js";
import type { PropertyStatus } from "@nexora/shared";

export interface CreatePropertyInput {
  externalId?: string | null;
  title: string;
  transactionType: "RENT" | "BUY" | "RENT_OR_BUY";
  propertyType?: string | null;
  city: string;
  neighborhood?: string | null;
  price: number;
  condoFee?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parkingSpaces?: number | null;
  petsAllowed?: boolean | null;
  rentalGuarantees?: string[];
  status?: PropertyStatus;
  url?: string | null;
  mainImageUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdatePropertyInput {
  title?: string;
  transactionType?: string;
  propertyType?: string | null;
  city?: string;
  neighborhood?: string | null;
  price?: number;
  condoFee?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parkingSpaces?: number | null;
  petsAllowed?: boolean | null;
  status?: PropertyStatus;
  url?: string | null;
  mainImageUrl?: string | null;
}

export interface PropertyFilterParams {
  transactionType?: string;
  propertyType?: string;
  city?: string;
  neighborhood?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  petsAllowed?: boolean;
  status?: PropertyStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PropertyMatchRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  property_id: string;
  score: number;
  reasons_json: string[];
  status: string;
  created_at: string;
  property?: PropertyRow;
}

export class PropertyRepository {
  async create(ctx: TenantContext, input: CreatePropertyInput): Promise<PropertyRow> {
    assertTenantContext(ctx);

    const sql = `
      INSERT INTO properties (
        tenant_id,
        external_id,
        title,
        transaction_type,
        property_type,
        city,
        neighborhood,
        price,
        condo_fee,
        bedrooms,
        bathrooms,
        parking_spaces,
        pets_allowed,
        rental_guarantees_json,
        status,
        url,
        main_image_url,
        metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, 'AVAILABLE'), $16, $17, $18)
      RETURNING *;
    `;

    const params = [
      ctx.tenantId,
      input.externalId ?? null,
      input.title,
      input.transactionType,
      input.propertyType ?? null,
      input.city,
      input.neighborhood ?? null,
      input.price,
      input.condoFee ?? null,
      input.bedrooms ?? null,
      input.bathrooms ?? null,
      input.parkingSpaces ?? null,
      input.petsAllowed ?? null,
      JSON.stringify(input.rentalGuarantees ?? []),
      input.status ?? null,
      input.url ?? null,
      input.mainImageUrl ?? null,
      JSON.stringify(input.metadata ?? {}),
    ];

    const result = await query<PropertyRow>(sql, params);
    const row = result.rows[0];
    if (!row) throw new Error("Falha ao cadastrar imóvel.");
    return row;
  }

  async bulkCreate(
    ctx: TenantContext,
    properties: CreatePropertyInput[],
  ): Promise<{ inserted: number }> {
    assertTenantContext(ctx);

    let inserted = 0;
    for (const prop of properties) {
      await this.create(ctx, prop);
      inserted++;
    }
    return { inserted };
  }

  async findById(ctx: TenantContext, id: string): Promise<PropertyRow | null> {
    assertTenantContext(ctx);

    const sql = `SELECT * FROM properties WHERE id = $1 AND tenant_id = $2 LIMIT 1;`;
    const result = await query<PropertyRow>(sql, [id, ctx.tenantId]);
    return result.rows[0] || null;
  }

  async list(ctx: TenantContext, filters?: PropertyFilterParams): Promise<PropertyRow[]> {
    assertTenantContext(ctx);

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [ctx.tenantId];
    let idx = 2;

    if (filters?.transactionType) {
      conditions.push(`transaction_type = $${idx++}`);
      params.push(filters.transactionType);
    }
    if (filters?.propertyType) {
      conditions.push(`property_type ILIKE $${idx++}`);
      params.push(`%${filters.propertyType}%`);
    }
    if (filters?.city) {
      conditions.push(`city ILIKE $${idx++}`);
      params.push(`%${filters.city}%`);
    }
    if (filters?.neighborhood) {
      conditions.push(`neighborhood ILIKE $${idx++}`);
      params.push(`%${filters.neighborhood}%`);
    }
    if (filters?.minPrice !== undefined) {
      conditions.push(`price >= $${idx++}`);
      params.push(filters.minPrice);
    }
    if (filters?.maxPrice !== undefined) {
      conditions.push(`price <= $${idx++}`);
      params.push(filters.maxPrice);
    }
    if (filters?.bedrooms !== undefined) {
      conditions.push(`bedrooms >= $${idx++}`);
      params.push(filters.bedrooms);
    }
    if (filters?.petsAllowed !== undefined) {
      conditions.push(`pets_allowed = $${idx++}`);
      params.push(filters.petsAllowed);
    }
    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.search) {
      conditions.push(`(title ILIKE $${idx} OR neighborhood ILIKE $${idx} OR city ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const sql = `
      SELECT * FROM properties
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    params.push(limit, offset);

    const result = await query<PropertyRow>(sql, params);
    return result.rows;
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdatePropertyInput,
  ): Promise<PropertyRow | null> {
    assertTenantContext(ctx);

    const fields: string[] = [];
    const params: unknown[] = [id, ctx.tenantId];
    let index = 3;

    if (input.title !== undefined) {
      fields.push(`title = $${index++}`);
      params.push(input.title);
    }
    if (input.transactionType !== undefined) {
      fields.push(`transaction_type = $${index++}`);
      params.push(input.transactionType);
    }
    if (input.propertyType !== undefined) {
      fields.push(`property_type = $${index++}`);
      params.push(input.propertyType);
    }
    if (input.city !== undefined) {
      fields.push(`city = $${index++}`);
      params.push(input.city);
    }
    if (input.neighborhood !== undefined) {
      fields.push(`neighborhood = $${index++}`);
      params.push(input.neighborhood);
    }
    if (input.price !== undefined) {
      fields.push(`price = $${index++}`);
      params.push(input.price);
    }
    if (input.condoFee !== undefined) {
      fields.push(`condo_fee = $${index++}`);
      params.push(input.condoFee);
    }
    if (input.bedrooms !== undefined) {
      fields.push(`bedrooms = $${index++}`);
      params.push(input.bedrooms);
    }
    if (input.bathrooms !== undefined) {
      fields.push(`bathrooms = $${index++}`);
      params.push(input.bathrooms);
    }
    if (input.parkingSpaces !== undefined) {
      fields.push(`parking_spaces = $${index++}`);
      params.push(input.parkingSpaces);
    }
    if (input.petsAllowed !== undefined) {
      fields.push(`pets_allowed = $${index++}`);
      params.push(input.petsAllowed);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${index++}`);
      params.push(input.status);
    }
    if (input.url !== undefined) {
      fields.push(`url = $${index++}`);
      params.push(input.url);
    }
    if (input.mainImageUrl !== undefined) {
      fields.push(`main_image_url = $${index++}`);
      params.push(input.mainImageUrl);
    }

    if (fields.length === 0) {
      return this.findById(ctx, id);
    }

    const sql = `
      UPDATE properties
      SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *;
    `;

    const result = await query<PropertyRow>(sql, params);
    return result.rows[0] || null;
  }

  async saveMatch(
    ctx: TenantContext,
    leadId: string,
    propertyId: string,
    score: number,
    reasons: string[],
  ): Promise<PropertyMatchRow> {
    assertTenantContext(ctx);

    const sql = `
      INSERT INTO property_matches (
        tenant_id,
        lead_id,
        property_id,
        score,
        reasons_json,
        status
      ) VALUES ($1, $2, $3, $4, $5, 'SUGGESTED')
      RETURNING *;
    `;

    const result = await query<PropertyMatchRow>(sql, [
      ctx.tenantId,
      leadId,
      propertyId,
      score,
      JSON.stringify(reasons),
    ]);

    const row = result.rows[0];
    if (!row) throw new Error("Falha ao salvar match de imóvel.");
    return row;
  }

  async listMatchesForLead(ctx: TenantContext, leadId: string): Promise<PropertyMatchRow[]> {
    assertTenantContext(ctx);

    const sql = `
      SELECT m.*, p.title as property_title, p.price as property_price, p.neighborhood as property_neighborhood
      FROM property_matches m
      JOIN properties p ON p.id = m.property_id
      WHERE m.tenant_id = $1 AND m.lead_id = $2
      ORDER BY m.score DESC, m.created_at DESC;
    `;

    const result = await query<PropertyMatchRow>(sql, [ctx.tenantId, leadId]);
    return result.rows;
  }

  async delete(ctx: TenantContext, id: string): Promise<boolean> {
    assertTenantContext(ctx);

    const sql = `DELETE FROM properties WHERE id = $1 AND tenant_id = $2;`;
    const result = await query(sql, [id, ctx.tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
