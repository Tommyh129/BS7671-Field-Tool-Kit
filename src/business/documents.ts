import { jsPDF } from "jspdf";
import {
  type Company,
  type Materials,
  type Project,
  type Quote,
  type SavedCalculation,
  type DocumentOptions,
  businessProfile,
  blankCompany,
  validateProfile,
  documentBranding,
  documentOptions,
  customerDocument,
  calculationDocument,
  linePence,
  materialTotals,
  money,
  ukDate,
  today,
} from "./model";

function text(value: unknown): string {
  const result = String(value ?? "")
    .replace(/\u03a9/g, "ohm")
    .replace(/\u03bc/g, "\u00b5")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2022/g, "-")
    .replace(/\u0394/g, "Delta")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ");
  if (/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/.test(result))
    throw Error(
      "PDF export currently supports Latin-script text. Replace unsupported symbols before exporting."
    );
  return result;
}

export class Document {
  pdf = new jsPDF();
  y = 20;
  bottom = 265;
  private start = 20;
  private brand: ReturnType<typeof documentBranding>;
  constructor(
    private title: string,
    company: Company,
    private logo?: string,
    options: Partial<DocumentOptions> = {}
  ) {
    // PNG soft masks need an effective PDF version of at least 1.4.
    this.pdf.internal.events.subscribe("putCatalog", () => {
      const internal=this.pdf.internal as typeof this.pdf.internal & {write:(value:string)=>void};
      internal.write('/Version /1.4');
    });
    validateProfile(company);
    this.brand = documentBranding(company, options);
    this.pdf.setProperties({ title: text(title), creator: "The Sparkys Mate" });
    this.pdf.setFont('helvetica','normal');this.pdf.setFontSize(8);
    const footerLines = this.pdf.splitTextToSize(
      text(this.brand.footer),
      175
    ) as string[];
    if(footerLines.length>5)throw Error('Document footer must fit within five printed lines.');
    this.bottom = Math.min(269, 278 - footerLines.length * 3.8 - 7);
    this.header();
  }
  private header() {
    const p = this.pdf;
    p.setTextColor(25);
    p.setFont("helvetica", "bold");
    p.setFontSize(15);
    const names = p.splitTextToSize(
      text(this.brand.name || this.brand.legalName || "Business"),
      this.logo ? 130 : 180
    ) as string[];
    let y = 20;
    for (const line of names) {
      p.text(line, 15, y);
      y += 6.5;
    }
    if (this.logo) {
      const props = p.getImageProperties(this.logo);
      const scale = Math.min(40 / props.width, 26 / props.height);
      const w = props.width * scale,
        h = props.height * scale;
      p.addImage(
        this.logo,
        props.fileType,
        195 - w,
        15,
        w,
        h,
        undefined,
        "FAST"
      );
      y = Math.max(y, 15 + h + 3);
    }
    p.setFont("helvetica", "normal");
    p.setFontSize(9);
    const details = [
      this.brand.legalName && this.brand.legalName !== this.brand.name
        ? `Legal company: ${this.brand.legalName}`
        : "",
      this.brand.address,
      [this.brand.contactName, this.brand.phone, this.brand.email]
        .filter(Boolean)
        .join(" | "),
      this.brand.website,
      [
        this.brand.registrationNumber
          ? `Company registration: ${this.brand.registrationNumber}`
          : "",
        this.brand.vatRegistered && this.brand.vatNumber
          ? `VAT registration: ${this.brand.vatNumber}`
          : "",
      ]
        .filter(Boolean)
        .join(" | "),
    ]
      .filter(Boolean)
      .join("\n");
    for (const line of p.splitTextToSize(text(details), 180) as string[]) {
      if (line) {
        p.text(line, 15, y);
        y += 4.5;
      }
    }
    if (y > 155)
      throw Error(
        "Business header is too long. Shorten the address or contact details before exporting."
      );
    y += 4;
    p.setDrawColor(185);
    p.line(15, y, 195, y);
    this.start = this.y = y + 9;
  }
  private page() {
    this.pdf.addPage();
    this.header();
  }
  ensure(height: number) {
    if (this.y + height > this.bottom) this.page();
  }
  paragraph(value: unknown, size = 10, bold = false) {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    const lines = this.pdf.splitTextToSize(text(value), 180) as string[];
    for (const line of lines) {
      this.ensure(size * 0.5 + 1);
      this.pdf.setFont("helvetica", bold ? "bold" : "normal");
      this.pdf.setFontSize(size);
      this.pdf.setTextColor(25);
      this.pdf.text(line, 15, this.y);
      this.y += size * 0.5 + 1;
    }
    this.y += 2;
  }
  section(label: string, value: string | undefined) {
    if (!value?.trim()) return;
    this.ensure(18);
    this.paragraph(label, 10, true);
    this.paragraph(value, 9);
    this.y += 2;
  }
  table(headers: string[], rows: string[][], widths: number[]) {
    const head = () => {
      this.ensure(13);
      const p = this.pdf;
      p.setFillColor(23, 62, 49);
      p.rect(15, this.y - 4, 180, 9, "F");
      p.setTextColor(255);
      p.setFont("helvetica", "bold");
      p.setFontSize(9);
      let x = 15;
      headers.forEach((h, i) => {
        p.text(text(h), x + 2, this.y + 1);
        x += widths[i];
      });
      this.y += 10;
      p.setTextColor(25);
    };
    head();
    for (const row of rows) {
      this.pdf.setFont("helvetica", "normal");
      this.pdf.setFontSize(9);
      const lines = row.map(
        (cell, i) =>
          this.pdf.splitTextToSize(text(cell), widths[i] - 4) as string[]
      );
      const count = Math.max(1, ...lines.map((v) => v.length));
      for (let offset = 0; offset < count; ) {
        if (this.y + 10 > this.bottom) {
          this.page();
          head();
        }
        this.pdf.setFont("helvetica", "normal");
        this.pdf.setFontSize(9);
        const chunk = Math.max(
          1,
          Math.min(count - offset, Math.floor((this.bottom - this.y - 3) / 4.5))
        );
        let x = 15;
        lines.forEach((cells, i) => {
          const content = cells.slice(offset, offset + chunk);
          if (content.length) this.pdf.text(content, x + 2, this.y);
          x += widths[i];
        });
        this.y += chunk * 4.5 + 3;
        offset += chunk;
      }
      this.pdf.setDrawColor(215);
      this.pdf.line(15, this.y - 1, 195, this.y - 1);
      this.y += 2;
    }
    this.y += 5;
  }
  totals(rows: [string, number][]) {
    this.ensure(rows.length * 7 + 5);
    for (const [label, value] of rows) {
      this.pdf.setFont("helvetica", label === "Total" ? "bold" : "normal");
      this.pdf.setFontSize(10);
      this.pdf.setTextColor(25);
      this.pdf.text(text(label), 110, this.y);
      this.pdf.text(text(money(value)), 195, this.y, { align: "right" });
      this.y += 7;
    }
    this.y += 5;
  }
  payments() {
    this.section("Payment instructions", this.brand.paymentInstructions);
    this.section("Bank details", this.brand.bankDetails);
  }
  finish() {
    const p = this.pdf,
      count = p.getNumberOfPages();
    p.setFont("helvetica", "normal");
    p.setFontSize(8);
    const footer = p.splitTextToSize(text(this.brand.footer), 175) as string[];
    const ref = p.splitTextToSize(text(this.title), 155) as string[];
    for (let page = 1; page <= count; page++) {
      p.setPage(page);
      p.setFont("helvetica", "normal");
      p.setFontSize(8);
      p.setTextColor(90);
      p.setDrawColor(210);
      p.line(15, 278 - footer.length * 3.8, 195, 278 - footer.length * 3.8);
      footer.forEach((line, i) =>
        p.text(line, 15, 282 - footer.length * 3.8 + i * 3.8)
      );
      p.text(ref.slice(0, 2), 15, 289);
      p.text(`${page} / ${count}`, 195, 289, { align: "right" });
    }
    return p.output("blob");
  }
}
function customerSite(
  project: Pick<Project, "customer" | "title" | "address" | "email" | "phone">,
  options: DocumentOptions
) {
  return [
    project.customer,
    project.title,
    project.address,
    options.showContactDetails ? project.email : "",
    options.showContactDetails ? project.phone : "",
  ]
    .filter(Boolean)
    .join("\n");
}
export function quotePdf(quote: Quote, logo?: string): Blob {
  const value = customerDocument(quote),
    options = documentOptions(quote.documentOptions);
  const d = new Document(
    `${quote.type} ${quote.reference} - revision ${quote.revision}`,
    quote.company,
    logo,
    options
  );
  d.paragraph(
    `${value.type.toUpperCase()} ${value.reference} | Revision ${
      value.revision
    }`,
    14,
    true
  );
  if (!quote.issuedAt) d.paragraph("DRAFT - not issued", 10, true);
  d.paragraph(
    `Issue date: ${ukDate(value.issueDate)}${
      value.validUntil ? ` | Valid until: ${ukDate(value.validUntil)}` : ""
    }`,
    9
  );
  d.section("Customer / site", customerSite(value.customer, options));
  d.section("Scope of work", value.scope);
  d.table(
    ["Description", "Qty", "Unit", "Rate", "Total"],
    value.items.map((i) => [
      `${i.category}: ${i.description}`,
      i.quantity,
      i.unit,
      money(linePence("1", i.rate)),
      money(i.total),
    ]),
    [81, 18, 18, 30, 33]
  );
  d.totals([
    ["Subtotal", value.totals.subtotal],
    ["Discount", -value.totals.discount],
    ["Net", value.totals.net],
    [
      value.company.vatRegistered
        ? `VAT (${quote.vatPercent}%)`
        : "VAT (not registered)",
      value.totals.vat,
    ],
    ["Total", value.totals.total],
  ]);
  d.section("Exclusions", value.exclusions);
  d.section("Payment terms", value.terms);
  d.section("Customer notes", value.notes);
  d.payments();
  return d.finish();
}
export function materialsPdf(
  project: Project,
  list: Materials,
  company: Company,
  logo?: string,
  settings: Partial<DocumentOptions> = {}
): Blob {
  const options = documentOptions(settings);
  const label = options.internal ? "INTERNAL MATERIALS LIST" : "MATERIALS LIST";
  const reference = `MAT-${project.number}`;
  const d = new Document(`${label} ${reference}`, company, logo, options);
  d.paragraph(`${label} ${reference}`, 14, true);
  d.paragraph(list.name, 12, true);
  d.paragraph(`Issue date: ${ukDate(today())}`, 9);
  d.section("Customer / site", customerSite(project, options));
  if (options.internal) {
    d.table(
      ["Item / supplier / private notes", "Qty", "Unit", "Cost", "Total"],
      list.items.map((i) => [
        [
          i.description,
          i.code,
          i.supplier,
          i.notes,
          i.purchased ? "Purchased" : "Not purchased",
        ]
          .filter(Boolean)
          .join("\n"),
        i.quantity,
        i.unit,
        i.cost ? money(linePence("1", i.cost)) : "-",
        i.cost ? money(linePence(i.quantity, i.cost)) : "-",
      ]),
      [81, 18, 18, 30, 33]
    );
    d.totals([["Known costs", materialTotals(list)]]);
    d.section("Private list notes", list.notes);
    d.paragraph(
      "INTERNAL - includes costs and purchasing information. Not a customer selling-price document.",
      9
    );
  } else
    d.table(
      ["Description / product code", "Quantity", "Unit"],
      list.items.map((i) => [
        [i.description, i.code].filter(Boolean).join("\n"),
        i.quantity,
        i.unit,
      ]),
      [115, 30, 35]
    );
  d.section("Payment terms", company.terms);
  d.payments();
  return d.finish();
}
export function clientTechnicalData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clientTechnicalData);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "cost",
              "costs",
              "unitcost",
              "margin",
              "margins",
              "notes",
              "privatenotes",
              "internalnotes",
              "purchased",
              "supplier",
              "userid",
              "owneruid",
              "purchasetoken",
            ].includes(key.replace(/[ _-]/g, "").toLowerCase())
        )
        .map(([key, item]) => [key, clientTechnicalData(item)])
    );
  return value;
}
export function snapshotPdf(
  name: string,
  snapshot: SavedCalculation,
  company: Company = blankCompany(),
  project?: Project,
  logo?: string,
  settings: Partial<DocumentOptions> = {},
  referenceOverride?: string
): Blob {
  const value = calculationDocument(snapshot),
    options = documentOptions(settings);
  const reference =
    referenceOverride ||
    `CALC-${project?.number || "REPORT"}-${snapshot.snapshot.createdAt.slice(
      0,
      10
    )}`;
  const label = options.internal
    ? "INTERNAL CALCULATION REPORT"
    : "CALCULATION REPORT";
  const d = new Document(`${label} ${reference}`, company, logo, options);
  d.paragraph(`${label} ${reference}`, 14, true);
  d.paragraph(name, 12, true);
  d.paragraph(
    `Issue date: ${ukDate(today())} | Original calculation: ${ukDate(
      value.calculation.createdAt
    )}`,
    9
  );
  if (project) d.section("Customer / site", customerSite(project, options));
  d.paragraph(value.calculation.title, 10, true);
  d.paragraph(`Saved: ${ukDate(value.savedAt)} | ${value.engineVersion}`, 8);
  const results = Object.fromEntries(
    Object.entries(value.calculation.results).filter(
      ([key]) => !["dataSources", "dataSourceIds"].includes(key)
    )
  );
  d.section(
    "Original inputs",
    JSON.stringify(
      options.internal
        ? value.calculation.inputs
        : clientTechnicalData(value.calculation.inputs),
      null,
      2
    )
  );
  d.section(
    "Original results",
    JSON.stringify(
      options.internal ? results : clientTechnicalData(results),
      null,
      2
    )
  );
  d.section("Units", JSON.stringify(value.units, null, 2));
  d.section(
    "Reference metadata / assumptions",
    JSON.stringify(value.referenceMetadata, null, 2)
  );
  d.paragraph(
    "Historical snapshot; saving a calculation does not certify compliance.",
    9
  );
  d.section("Payment terms", company.terms);
  d.payments();
  return d.finish();
}
export function calculationTextPdf(
  summary: string,
  company: Company,
  project: Project,
  reference: string,
  logo?: string,
  settings: Partial<DocumentOptions> = {}
): Blob {
  const options = documentOptions(settings);
  const d = new Document(
    `CALCULATION REPORT ${reference}`,
    company,
    logo,
    options
  );
  d.paragraph(`CALCULATION REPORT ${reference}`, 14, true);
  d.paragraph(`Issue date: ${ukDate(today())}`, 9);
  if (project.customer || project.address || project.title)
    d.section("Customer / site", customerSite(project, options));
  const plain = summary
    .replace(/\u2705/g, "PASS")
    .replace(/\u274c/g, "FAIL")
    .replace(/\u26a1/g, "")
    .replace(/\u26a0/g, "WARNING")
    .replace(/\u2192/g, "->")
    .replace(/[\u{1f300}-\u{1faff}\ufe0f]/gu, "");
  d.section("Original calculation summary", plain);
  d.paragraph(
    "Calculation guidance only; this report does not certify compliance.",
    9
  );
  d.section("Payment terms", company.terms);
  d.payments();
  return d.finish();
}
