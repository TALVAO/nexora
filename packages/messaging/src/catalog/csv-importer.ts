import type { CreatePropertyInput } from "@nexora/database";

export class CsvPropertyImporter {
  /**
   * Converte texto CSV em array de CreatePropertyInput validados.
   * Formato esperado no cabeçalho:
   * external_id,title,transaction_type,property_type,city,neighborhood,price,condo_fee,bedrooms,bathrooms,parking_spaces,pets_allowed,url,main_image_url
   */
  parseCsv(csvContent: string): CreatePropertyInput[] {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      return [];
    }

    const header = lines[0]!
      .toLowerCase()
      .split(",")
      .map((h) => h.trim());
    const properties: CreatePropertyInput[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));

      const row: Record<string, string> = {};
      header.forEach((h, idx) => {
        row[h] = cols[idx] || "";
      });

      if (!row["title"] || !row["city"] || !row["price"]) {
        continue; // Pular linhas inválidas sem campos obrigatórios
      }

      const txRaw = (row["transaction_type"] || "RENT").toUpperCase();
      const transactionType = txRaw.includes("BUY") || txRaw.includes("VENDA") ? "BUY" : "RENT";

      properties.push({
        externalId: row["external_id"] || null,
        title: row["title"],
        transactionType,
        propertyType: row["property_type"] || "Apartamento",
        city: row["city"],
        neighborhood: row["neighborhood"] || null,
        price: parseFloat(row["price"]) || 0,
        condoFee: row["condo_fee"] ? parseFloat(row["condo_fee"]) : null,
        bedrooms: row["bedrooms"] ? parseInt(row["bedrooms"], 10) : null,
        bathrooms: row["bathrooms"] ? parseInt(row["bathrooms"], 10) : null,
        parkingSpaces: row["parking_spaces"] ? parseInt(row["parking_spaces"], 10) : null,
        petsAllowed:
          row["pets_allowed"] === "true" ||
          row["pets_allowed"] === "1" ||
          row["pets_allowed"]?.toLowerCase() === "sim",
        url: row["url"] || null,
        mainImageUrl: row["main_image_url"] || null,
        status: "AVAILABLE",
      });
    }

    return properties;
  }
}
