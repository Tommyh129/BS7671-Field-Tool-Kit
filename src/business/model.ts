import type { CalculationHistory } from "../types";
import type { InvoiceDraft } from './invoices/model';
import type { RamsDraft, RamsTemplate } from './rams/model';

export const PROJECT_STATUSES = [
  "Draft",
  "Quoted",
  "Accepted",
  "In Progress",
  "Completed",
  "Archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Kind =
  | "project"
  | "materials"
  | "quote"
  | "photo"
  | "calculation"
  | "settings"
  | "ramsDraft"
  | "ramsTemplate"
  | "invoiceDraft";
export interface Project {
  number: string;
  customer: string;
  title: string;
  address: string;
  email: string;
  phone: string;
  description: string;
  notes: string;
  status: ProjectStatus;
  startDate?: string;
}
export interface MaterialItem {
  id: string;
  description: string;
  code: string;
  supplier: string;
  quantity: string;
  unit: string;
  cost: string;
  notes: string;
  purchased: boolean;
}
export interface Materials {
  name: string;
  notes: string;
  items: MaterialItem[];
}
export interface SellingItem {
  id: string;
  category: "Materials" | "Labour" | "Other";
  description: string;
  quantity: string;
  unit: string;
  rate: string;
}
export interface Company {
  businessType?: 'soleTrader'|'limited'|'other'|'';
  invoiceDueDays?: number;
  invoiceFooter?: string;
  name: string;
  legalName?: string;
  contactName?: string;
  website?: string;
  registrationNumber?: string;
  quoteValidityDays?: number;
  footer?: string;
  paymentInstructions?: string;
  bankDetails?: string;
  address: string;
  email: string;
  phone: string;
  vatRegistered: boolean;
  vatNumber: string;
  terms: string;
  exclusions: string;
  logoId?: string;
}
export interface DocumentOptions {
  showContactDetails: boolean;
  showPaymentInstructions: boolean;
  showBankDetails: boolean;
  internal: boolean;
}
export const documentOptions = (
  value: Partial<DocumentOptions> = {}
): DocumentOptions => ({
  showContactDetails: value.showContactDetails ?? true,
  showPaymentInstructions: value.showPaymentInstructions === true,
  showBankDetails: value.showBankDetails === true,
  internal: value.internal === true,
});
export interface Quote {
  documentOptions?: DocumentOptions;
  reference: string;
  revision: number;
  type: "Quote" | "Estimate";
  issueDate: string;
  validUntil: string;
  customer: Pick<Project, "customer" | "address" | "email" | "phone" | "title">;
  company: Company;
  scope: string;
  items: SellingItem[];
  discount: string;
  vatPercent: string;
  terms: string;
  exclusions: string;
  notes: string;
  status: "Draft" | "Sent" | "Accepted" | "Declined" | "Expired";
  issuedAt?: string;
  pdfId?: string;
}
export interface JobPhoto {
  caption: string;
  addedAt: string;
  imageId: string;
  thumbnailId: string;
}
export interface SavedCalculation {
  name: string;
  snapshot: CalculationHistory;
  engineVersion: string;
  referenceMetadata: unknown;
  units: Record<string, string>;
  savedAt: string;
}
export interface BusinessPayloads {
  ramsDraft: RamsDraft;
  ramsTemplate: RamsTemplate;
  invoiceDraft: InvoiceDraft;
  project: Project;
  materials: Materials;
  quote: Quote;
  photo: JobPhoto;
  calculation: SavedCalculation;
  settings: Company;
}
export type SyncState = "pending" | "synced" | "error" | "conflict";
export interface BusinessRecord<K extends Kind = Kind> {
  id: string;
  ownerUid: string;
  projectId: string;
  kind: K;
  payload: BusinessPayloads[K];
  createdAt: string;
  updatedAt: string;
  baseRevision: number;
  mutationId: string;
  sync: SyncState;
  deleted: boolean;
  error?: string;
}
export const blankCompany = (): Company => ({
  name: "",
  legalName: "",
  contactName: "",
  website: "",
  registrationNumber: "",
  quoteValidityDays: 30,
  footer: "",
  paymentInstructions: "",
  bankDetails: "",
  address: "",
  email: "",
  phone: "",
  vatRegistered: false,
  vatNumber: "",
  terms: "Payment due within 14 days.",
  exclusions: "",
  logoId: "",
});
export function businessProfile(value: Partial<Company> = {}): Company {
  return { ...blankCompany(), ...value,quoteValidityDays:value.quoteValidityDays ?? 30 };
}
export function validateProfile(value: Company) {
  if(value.invoiceDueDays!==undefined&&(!Number.isInteger(value.invoiceDueDays)||value.invoiceDueDays<0||value.invoiceDueDays>3650))throw Error('Invoice payment period must be a whole number from 0 to 3650 days.');
  if((value.invoiceFooter||'').length>400||(value.invoiceFooter||'').split(/\r?\n/).length>5)throw Error('Invoice footer must fit within five printed lines and 400 characters.');
  const limits: Partial<Record<keyof Company, number>> = {
    name: 200,
    legalName: 200,
    address: 1000,
    contactName: 150,
    email: 254,
    phone: 80,
    website: 300,
    registrationNumber: 100,
    vatNumber: 100,
    footer: 400,
    paymentInstructions: 3000,
    bankDetails: 2000,
  };
  for (const [key, max] of Object.entries(limits))
    if (String(value[key] ?? "").length > max)
      throw Error(`${key}: use at most ${max} characters.`);
  const days = value.quoteValidityDays ?? 30;
  if((value.footer || '').split(/\r?\n/).length>5)throw Error('Document footer must fit within five printed lines.');
  if (!Number.isInteger(days) || days < 0 || days > 3650)
    throw Error("Quote validity must be a whole number from 0 to 3650 days.");
}
export function quoteValidUntil(date: string, company: Company) {
  const days = businessProfile(company).quoteValidityDays;
  if (!days) return "";
  validateProfile(company);
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(value.getDate()).padStart(2, "0")}`;
}
export function documentBranding(
  company: Company,
  options: Partial<DocumentOptions> = {}
) {
  const c = businessProfile(company);
  const o = documentOptions(options);
  return {
    name: c.name,
    legalName: c.legalName,
    address: c.address,
    contactName: o.showContactDetails ? c.contactName : "",
    phone: o.showContactDetails ? c.phone : "",
    email: o.showContactDetails ? c.email : "",
    website: o.showContactDetails ? c.website : "",
    registrationNumber: c.registrationNumber,
    vatRegistered: c.vatRegistered,
    vatNumber: c.vatRegistered ? c.vatNumber : "",
    footer: c.footer,
    terms: c.terms,
    paymentInstructions: o.showPaymentInstructions ? c.paymentInstructions : "",
    bankDetails: o.showBankDetails ? c.bankDetails : "",
  };
}
export const blankProject = (number: string): Project => ({
  number,
  customer: "",
  title: "",
  address: "",
  email: "",
  phone: "",
  description: "",
  notes: "",
  status: "Draft",
});
export const materialItem = (): MaterialItem => ({
  id: crypto.randomUUID(),
  description: "",
  code: "",
  supplier: "",
  quantity: "1",
  unit: "each",
  cost: "",
  notes: "",
  purchased: false,
});
export const sellingItem = (): SellingItem => ({
  id: crypto.randomUUID(),
  category: "Materials",
  description: "",
  quantity: "1",
  unit: "each",
  rate: "0.00",
});
export const today = () => new Date().toLocaleDateString("en-CA");
export const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100
  );
export const ukDate = (iso: string) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(
        "en-GB"
      )
    : "";

// Decimal strings are converted to scaled integers before any money arithmetic.
export function decimal(value: string, places = 2): number {
  const input = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(input))
    throw new Error("Enter a non-negative decimal number.");
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > places)
    throw new Error(`Use no more than ${places} decimal places.`);
  const number =
    Number(whole) * 10 ** places + Number(fraction.padEnd(places, "0"));
  if (!Number.isSafeInteger(number) || number > 1_000_000_000)
    throw new Error("Value is too large.");
  return number;
}
export function linePence(quantity: string, price: string) {
  const q = BigInt(decimal(quantity, 3));
  const p = BigInt(decimal(price || "0", 2));
  const result = Number((q * p + 500n) / 1000n);
  if (!Number.isSafeInteger(result) || result > 1_000_000_000)
    throw new Error("Line total is too large.");
  return result;
}
export function materialTotals(list: Materials) {
  return list.items.reduce(
    (sum, item) => sum + linePence(item.quantity, item.cost),
    0
  );
}
export function quoteTotals(quote: Quote) {
  const lines = quote.items.map((item) => linePence(item.quantity, item.rate));
  const subtotal = lines.reduce((sum, line) => sum + line, 0);
  if (subtotal > 1_000_000_000) throw new Error("Document total is too large.");
  const discount = decimal(quote.discount || "0");
  if (discount > subtotal)
    throw new Error("Discount cannot exceed the subtotal.");
  const net = subtotal - discount;
  const rate = quote.company.vatRegistered
    ? decimal(quote.vatPercent || "0")
    : 0;
  if (rate > 10000)
    throw new Error("VAT percentage must be between 0 and 100.");
  const vat = Number((BigInt(net) * BigInt(rate) + 5000n) / 10000n);
  return { lines, subtotal, discount, net, vat, total: net + vat };
}
export function nextProjectNumber(records: BusinessRecord<"project">[]) {
  const values = records
    .map((record) => record.payload.number)
    .filter((n) => /^\d+$/.test(n));
  const max = Math.max(0, ...values.map(Number).filter(Number.isSafeInteger));
  if (max >= 999999999) throw new Error("Enter a project number manually.");
  return String(max + 1).padStart(
    Math.max(2, ...values.map((n) => n.length)),
    "0"
  );
}
export function quoteId(reference: string, revision: number) {
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(reference))
    throw new Error(
      "Reference: use 1-50 letters, numbers, hyphens or underscores."
    );
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error("Invalid revision.");
  return `quote-${reference}-r${revision}`;
}
export function revisionOf(quote: Quote, siblings: Quote[]): Quote {
  const revision =
    Math.max(
      quote.revision,
      ...siblings
        .filter((q) => q.reference === quote.reference)
        .map((q) => q.revision)
    ) + 1;
  const copy = structuredClone(quote);
  delete copy.issuedAt;
  delete copy.pdfId;
  return { ...copy, revision, status: "Draft", issueDate: today() };
}
export function importMaterials(items: MaterialItem[]): SellingItem[] {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    category: "Materials",
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    rate: "0.00",
  }));
}
// Explicit allow-list: no cost, supplier, purchased flags or margin fields reach customer PDFs.
export function customerDocument(quote: Quote) {
  const totals = quoteTotals(quote);
  const options = documentOptions(quote.documentOptions);
  return {
    type: quote.type,
    reference: quote.reference,
    revision: quote.revision,
    issueDate: quote.issueDate,
    validUntil: quote.validUntil,
    customer: {
      customer: quote.customer.customer,
      title: quote.customer.title,
      address: quote.customer.address,
      email: options.showContactDetails ? quote.customer.email : "",
      phone: options.showContactDetails ? quote.customer.phone : "",
    },
    company: documentBranding(quote.company, options),
    scope: quote.scope,
    items: quote.items.map(
      ({ description, quantity, unit, rate, category }, index) => ({
        description,
        quantity,
        unit,
        rate,
        category,
        total: totals.lines[index],
      })
    ),
    totals,
    terms: quote.terms,
    exclusions: quote.exclusions,
    notes: quote.notes,
  };
}
export function calculationSnapshot(
  name: string,
  snapshot: CalculationHistory
): SavedCalculation {
  if (!name.trim()) throw new Error("Enter a calculation name.");
  return {
    name: name.trim(),
    snapshot: structuredClone(snapshot),
    savedAt: new Date().toISOString(),
    engineVersion: "electrical-reference-engine/2026-10-17",
    referenceMetadata: structuredClone(
      snapshot.results?.dataSources ?? snapshot.results?.dataSourceIds ?? []
    ),
    units: {
      length: "m",
      conductorArea: "mm2",
      current: "A",
      impedance: "ohm",
      power: "kW",
      voltage: "V",
      temperature: "C",
      note: "Input field names and original result retain tool-specific units, including mA and mOhm where labelled.",
    },
  };
}
export function immutableIssuedUpdate(before: Quote, after: Quote) {
  if (!before.issuedAt) return true;
  const a = { ...before, status: "Draft" };
  const b = { ...after, status: "Draft" };
  return JSON.stringify(a) === JSON.stringify(b);
}
export function calculationDocument(value: SavedCalculation) {
  const { type, title, createdAt, inputs, results } = value.snapshot;
  return structuredClone({
    name: value.name,
    savedAt: value.savedAt,
    engineVersion: value.engineVersion,
    units: value.units,
    referenceMetadata: value.referenceMetadata,
    calculation: { type, title, createdAt, inputs, results },
  });
}
