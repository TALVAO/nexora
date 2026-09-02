import { describe, it, expect } from "vitest";
import { VrSyncPropertyImporter } from "../catalog/vrsync-importer.js";

/**
 * VRSync é o padrão XML oficial ZAP/VivaReal/OLX (Etapa 15.2). Os XML de
 * exemplo abaixo espelham a estrutura confirmada em
 * developers.grupozap.com/feeds/vrsync em 01/09/2026, não são inventados.
 */

function feed(listingsXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed>
  <Header>
    <Provider>Nexora</Provider>
    <Email>corretor@teste.com</Email>
    <PublishDate>2026-09-01T12:00:00</PublishDate>
  </Header>
  <Listings>
    ${listingsXml}
  </Listings>
</ListingDataFeed>`;
}

const VENDA_COMPLETA = `
<Listing>
  <ListingID>Imovel-01</ListingID>
  <Title>Lindo Apartamento a venda em São Paulo</Title>
  <TransactionType>For Sale</TransactionType>
  <DetailViewUrl>http://www.grupozap.com.br/imoveis/1005434</DetailViewUrl>
  <Media>
    <Item medium="video">https://www.youtube.com/watch?v=MukVADdjQD8</Item>
    <Item medium="image" caption="img1" primary="true">http://grupozap.com.br/foto01.jpg</Item>
    <Item medium="image" caption="img02">http://grupozap.com.br/foto02.jpg</Item>
  </Media>
  <Details>
    <UsageType>Residential</UsageType>
    <PropertyType>Residential / Apartment</PropertyType>
    <Description><![CDATA[80 metros quadrados no Consolação com 2 quartos.]]></Description>
    <ListPrice currency="BRL">860000</ListPrice>
    <LotArea unit="square metres">90</LotArea>
    <LivingArea unit="square metres">80</LivingArea>
    <PropertyAdministrationFee currency="BRL">980</PropertyAdministrationFee>
    <YearlyTax currency="BRL">4500</YearlyTax>
    <Bedrooms>2</Bedrooms>
    <Bathrooms>1</Bathrooms>
    <Suites>1</Suites>
    <Garage type="Parking Space">2</Garage>
    <Features>
      <Feature>Pool</Feature>
      <Feature>Gym</Feature>
    </Features>
  </Details>
  <Location displayAddress="Street">
    <Country abbreviation="BR">Brasil</Country>
    <State abbreviation="SP">Sao Paulo</State>
    <City>São Paulo</City>
    <Neighborhood>Consolação</Neighborhood>
    <Address>Rua Bela Cintra</Address>
    <StreetNumber>539</StreetNumber>
    <PostalCode>01415-003</PostalCode>
  </Location>
  <ContactInfo>
    <Name>Imobiliaria Feliz</Name>
    <Email>contato@imobiliariafeliz.com.br</Email>
  </ContactInfo>
</Listing>`;

describe("VrSyncPropertyImporter — padrão ZAP/VivaReal/OLX (Etapa 15.2)", () => {
  const importer = new VrSyncPropertyImporter();

  it("importa um Listing de venda completo com todos os campos mapeáveis", () => {
    const result = importer.parseXml(feed(VENDA_COMPLETA));

    expect(result.skipped).toEqual([]);
    expect(result.properties).toHaveLength(1);

    const property = result.properties[0]!;
    expect(property.externalId).toBe("Imovel-01");
    expect(property.title).toBe("Lindo Apartamento a venda em São Paulo");
    expect(property.transactionType).toBe("BUY");
    expect(property.propertyType).toBe("Apartment");
    expect(property.city).toBe("São Paulo");
    expect(property.neighborhood).toBe("Consolação");
    expect(property.price).toBe(860000);
    expect(property.condoFee).toBe(980);
    expect(property.bedrooms).toBe(2);
    expect(property.bathrooms).toBe(1);
    expect(property.parkingSpaces).toBe(2);
    expect(property.url).toBe("http://www.grupozap.com.br/imoveis/1005434");
    expect(property.mainImageUrl).toBe("http://grupozap.com.br/foto01.jpg");
    expect(property.availabilitySource).toBe("XML_FEED");
  });

  it("nunca inventa aceitação de pet — sempre null, mesmo com Features presentes", () => {
    const result = importer.parseXml(feed(VENDA_COMPLETA));
    expect(result.properties[0]!.petsAllowed).toBeNull();
  });

  it("mapeia TransactionType 'For Rent' para RENT e usa RentalPrice", () => {
    const xml = `
    <Listing>
      <ListingID>Aluguel-01</ListingID>
      <Title>Apartamento para alugar no centro</Title>
      <TransactionType>For Rent</TransactionType>
      <Details>
        <RentalPrice currency="BRL">2500</RentalPrice>
        <Bedrooms>2</Bedrooms>
        <Warranties>
          <Warranty>Caução</Warranty>
          <Warranty>Fiador</Warranty>
        </Warranties>
      </Details>
      <Location><City>Recife</City><Neighborhood>Boa Viagem</Neighborhood></Location>
    </Listing>`;

    const result = importer.parseXml(feed(xml));
    const property = result.properties[0]!;

    expect(property.transactionType).toBe("RENT");
    expect(property.price).toBe(2500);
    expect(property.rentalGuarantees).toEqual(["Caução", "Fiador"]);
  });

  // ---------------------------------------------------------------------------
  // TESTE CRÍTICO: "Sale/Rent" prioriza RentalPrice (locação é a prioridade
  // operacional do MVP — CLAUDE.md §1) e cai para ListPrice quando ausente.
  // ---------------------------------------------------------------------------
  it("TESTE CRÍTICO: 'Sale/Rent' prefere RentalPrice; sem ele, usa ListPrice", () => {
    const comAmbos = feed(`
    <Listing>
      <ListingID>Misto-01</ListingID>
      <Title>Casa para vender ou alugar</Title>
      <TransactionType>Sale/Rent</TransactionType>
      <Details><ListPrice currency="BRL">500000</ListPrice><RentalPrice currency="BRL">3000</RentalPrice></Details>
      <Location><City>Jundiaí</City></Location>
    </Listing>`);

    const soVenda = feed(`
    <Listing>
      <ListingID>Misto-02</ListingID>
      <Title>Casa para vender ou alugar sem preço de locação</Title>
      <TransactionType>Sale/Rent</TransactionType>
      <Details><ListPrice currency="BRL">500000</ListPrice></Details>
      <Location><City>Jundiaí</City></Location>
    </Listing>`);

    expect(importer.parseXml(comAmbos).properties[0]!.price).toBe(3000);
    expect(importer.parseXml(soVenda).properties[0]!.price).toBe(500000);
  });

  it("um único Listing no feed não colapsa para objeto solto (bug clássico de parser XML)", () => {
    const result = importer.parseXml(feed(VENDA_COMPLETA));
    expect(Array.isArray(result.properties)).toBe(true);
    expect(result.properties).toHaveLength(1);
  });

  it("processa múltiplos Listings no mesmo feed", () => {
    const xml = feed(`
    <Listing>
      <ListingID>Multi-01</ListingID>
      <Title>Primeiro imóvel do feed</Title>
      <TransactionType>For Rent</TransactionType>
      <Details><RentalPrice currency="BRL">1800</RentalPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>
    <Listing>
      <ListingID>Multi-02</ListingID>
      <Title>Segundo imóvel do feed</Title>
      <TransactionType>For Sale</TransactionType>
      <Details><ListPrice currency="BRL">300000</ListPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    const result = importer.parseXml(xml);
    expect(result.properties).toHaveLength(2);
    expect(result.properties.map((p) => p.externalId)).toEqual(["Multi-01", "Multi-02"]);
  });

  it("ignora e reporta Listing sem TransactionType reconhecido, sem derrubar o feed inteiro", () => {
    const xml = feed(`
    <Listing>
      <ListingID>Ruim-01</ListingID>
      <Title>Imóvel com transação desconhecida</Title>
      <TransactionType>Permuta</TransactionType>
      <Details><ListPrice currency="BRL">100000</ListPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>
    <Listing>
      <ListingID>Bom-01</ListingID>
      <Title>Imóvel válido no mesmo feed</Title>
      <TransactionType>For Sale</TransactionType>
      <Details><ListPrice currency="BRL">200000</ListPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    const result = importer.parseXml(xml);
    expect(result.properties).toHaveLength(1);
    expect(result.properties[0]!.externalId).toBe("Bom-01");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.listingId).toBe("Ruim-01");
    expect(result.skipped[0]!.reason).toMatch(/TransactionType/);
  });

  it("ignora e reporta Listing sem cidade", () => {
    const xml = feed(`
    <Listing>
      <ListingID>SemCidade-01</ListingID>
      <Title>Imóvel sem localização</Title>
      <TransactionType>For Rent</TransactionType>
      <Details><RentalPrice currency="BRL">1500</RentalPrice></Details>
      <Location></Location>
    </Listing>`);

    const result = importer.parseXml(xml);
    expect(result.properties).toHaveLength(0);
    expect(result.skipped[0]!.reason).toMatch(/City/);
  });

  it("ignora e reporta Listing sem nenhum preço válido", () => {
    const xml = feed(`
    <Listing>
      <ListingID>SemPreco-01</ListingID>
      <Title>Imóvel sem preço cadastrado</Title>
      <TransactionType>For Rent</TransactionType>
      <Details></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    const result = importer.parseXml(xml);
    expect(result.properties).toHaveLength(0);
    expect(result.skipped[0]!.reason).toMatch(/preço/i);
  });

  it("respeita CDATA e caracteres especiais no título", () => {
    const xml = feed(`
    <Listing>
      <ListingID>Cdata-01</ListingID>
      <Title><![CDATA[Apto & Cobertura <Top>]]></Title>
      <TransactionType>For Rent</TransactionType>
      <Details><RentalPrice currency="BRL">4000</RentalPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    const result = importer.parseXml(xml);
    expect(result.properties[0]!.title).toBe("Apto & Cobertura <Top>");
  });

  it("usa a primeira imagem quando nenhum Item de mídia está marcado como primary", () => {
    const xml = feed(`
    <Listing>
      <ListingID>SemPrimary-01</ListingID>
      <Title>Imóvel sem imagem principal marcada</Title>
      <TransactionType>For Rent</TransactionType>
      <Media>
        <Item medium="image">http://x/a.jpg</Item>
        <Item medium="image">http://x/b.jpg</Item>
      </Media>
      <Details><RentalPrice currency="BRL">2000</RentalPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    const result = importer.parseXml(xml);
    expect(result.properties[0]!.mainImageUrl).toBe("http://x/a.jpg");
  });

  it("não usa vídeo como imagem principal", () => {
    const xml = feed(`
    <Listing>
      <ListingID>SoVideo-01</ListingID>
      <Title>Imóvel com apenas vídeo cadastrado</Title>
      <TransactionType>For Rent</TransactionType>
      <Media><Item medium="video">https://youtube.com/x</Item></Media>
      <Details><RentalPrice currency="BRL">2000</RentalPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    const result = importer.parseXml(xml);
    expect(result.properties[0]!.mainImageUrl).toBeNull();
  });

  it("propertyType sem barra usa o texto inteiro; ausente vira null", () => {
    const comTipoSimples = feed(`
    <Listing>
      <ListingID>Tipo-01</ListingID>
      <Title>Imóvel com tipo simples</Title>
      <TransactionType>For Rent</TransactionType>
      <Details><RentalPrice currency="BRL">2000</RentalPrice><PropertyType>Studio</PropertyType></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    const semTipo = feed(`
    <Listing>
      <ListingID>Tipo-02</ListingID>
      <Title>Imóvel sem tipo informado</Title>
      <TransactionType>For Rent</TransactionType>
      <Details><RentalPrice currency="BRL">2000</RentalPrice></Details>
      <Location><City>Recife</City></Location>
    </Listing>`);

    expect(importer.parseXml(comTipoSimples).properties[0]!.propertyType).toBe("Studio");
    expect(importer.parseXml(semTipo).properties[0]!.propertyType).toBeNull();
  });

  it("rejeita XML malformado com erro claro em vez de estourar exceção opaca", () => {
    expect(() => importer.parseXml("<ListingDataFeed><Listings>")).toThrow(/XML inválido/);
  });

  it("rejeita XML bem formado mas que não é VRSync", () => {
    expect(() => importer.parseXml("<root><foo>bar</foo></root>")).toThrow(
      /não segue o formato VRSync/,
    );
  });

  it("feed sem nenhum Listing devolve lista vazia sem erro", () => {
    const result = importer.parseXml(feed(""));
    expect(result.properties).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
