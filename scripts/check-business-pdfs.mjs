import { mkdir, writeFile } from "node:fs/promises";
import {
  blankCompany,
  blankProject,
  materialItem,
  sellingItem,
} from "../src/business/model.ts";
import { quotePdf, materialsPdf } from "../src/business/pdf.ts";
await mkdir("build/business-qa", { recursive: true });
const company = {
  ...blankCompany(),
  name: "Example Electrical Services",
  address: "Business address\nUnited Kingdom",
  email: "office@example.com",
  vatRegistered: true,
  vatNumber: "EXAMPLE",
};
const items = Array.from({ length: 35 }, (_, i) => ({
  ...sellingItem(),
  description: `Circuit ${
    i + 1
  } - lighting installation, testing and making good at the agreed location.`,
  quantity: "2.5",
  unit: "each",
  rate: "19.99",
  cost: "INTERNAL_COST_SENTINEL",
}));
const quote = {
  reference: "Q-001",
  revision: 1,
  type: "Quote",
  issueDate: "2026-10-17",
  validUntil: "2026-11-17",
  customer: {
    customer: "Example Customer",
    title: "Kitchen rewire",
    address: "Example project site",
    email: "",
    phone: "",
  },
  company,
  scope: "Supply and install the items listed below.",
  items,
  discount: "10.00",
  vatPercent: "20",
  terms: company.terms,
  exclusions: "Decoration and remedial work outside the agreed scope.",
  notes: "",
  status: "Sent",
  issuedAt: "2026-10-17",
};
const pdf = quotePdf(quote);
await writeFile(
  "build/business-qa/quote.pdf",
  Buffer.from(await pdf.arrayBuffer())
);
const list = {
  name: "Site materials",
  notes: "Internal purchasing copy",
  items: Array.from({ length: 12 }, (_, i) => ({
    ...materialItem(),
    description: `Cable and fixings ${i + 1}`,
    supplier: "Example wholesaler",
    code: `REF-${i + 1}`,
    quantity: "25.5",
    unit: "metres",
    cost: "1.99",
    purchased: i % 2 === 0,
  })),
};
await writeFile(
  "build/business-qa/materials.pdf",
  Buffer.from(
    await materialsPdf(
      {
        ...blankProject("001"),
        customer: "Example Customer",
        title: "Kitchen rewire",
      },
      list,
      company
    ).arrayBuffer()
  )
);
console.log(
  "Generated quote and materials PDF QA fixtures in build/business-qa."
);
