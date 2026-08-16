import type { CreatePropertyInput } from "@nexora/database";

export class CsvPropertyImporter {
  /**
   * Converte texto CSV em array de CreatePropertyInput validados com suporte a aspas e vírgulas internas.
   */
  parseCsv(csvContent: string): CreatePropertyInput[] {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      return [];
    }

    const header = this.splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
    const properties: CreatePropertyInput[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      const cols = this.splitCsvLine(line);

      const row: Record<string, string> = {};
      header.forEach((h, idx) => {
        row[h] = cols[idx] || "";
      });

      if (!row["title"] || !row["city"] || !row["price"]) {
        continue;
      }

      const txRaw = (row["transaction_type"] || "RENT").toUpperCase();
      const transactionType = txRaw.includes("BUY") || txRaw.includes("VENDA") ? "BUY" : "RENT";

      properties.push({
        externalId: row["external_id"] || row["code"] || null,
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
        mainImageUrl: row["main_image_url"] || row["images"] || null,
        status: "AVAILABLE",
      });
    }

    return properties;
  }

  /**
   * Divide uma linha CSV respeitando strings entre aspas.
   */
  private splitCsvLine(text: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(cur.trim().replace(/^["']|["']$/g, ""));
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^["']|["']$/g, ""));
    return result;
  }
}
