import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/business/model.ts";
import { quotePdf, materialsPdf, snapshotPdf } from "../src/business/pdf.ts";
import { projectSyncGroups, syncGroupMessage } from '../src/business/sync-status.ts';
import { dueProjects, frequentTools, readToolUsage, recordToolUse, clearToolUsage, backDestination, TOOL_MODES } from '../src/services/homeSummary.ts';
import { AppMode } from '../src/types.ts';

test('every calculation/design tool returns to Design; non-tool pages retain Home as their back destination', () => {
  for (const mode of TOOL_MODES) assert.equal(backDestination(mode), AppMode.DESIGN, mode);
  for (const mode of [AppMode.HISTORY, AppMode.PRIVACY, AppMode.TERMS, AppMode.ACCOUNT_DELETION, AppMode.SUPPORT]) {
    assert.equal(backDestination(mode), AppMode.HOME, mode);
  }
});

test('home projects sort by start date and omit started, completed, deleted or invalid entries', () => {
  const project = (id, startDate, status = 'Accepted') => ({id, kind:'project', payload:{number:id, startDate, status}, deleted:false});
  const rows = [project('2','2026-11-20'), project('1','2026-11-02'), project('3','2026-11-01','In Progress'),
    project('4','2026-11-01','Completed'), project('5','2026-11-01','Archived'), project('6','2026-02-30'),
    project('7',''), {...project('8','2026-11-01'),deleted:true}, {kind:'quote',payload:{}}];
  assert.deepEqual(dueProjects(rows).map(row=>row.id), ['1','2']);
  assert.equal(rows[0].id,'2');
});

test('home has four deterministic tools and ranks by frequency without unlocking Pro', () => {
  assert.deepEqual(frequentTools({},false),[AppMode.ZS_CALCULATOR,AppMode.VOLTAGE_DROP,AppMode.DC_VOLTAGE_DROP,AppMode.THREE_PHASE]);
  const counts = {[AppMode.CABLE_FINDER]:5,[AppMode.SMART_CIRCUIT]:10};
  assert.equal(frequentTools(counts,true)[0], AppMode.SMART_CIRCUIT);
  assert.equal(frequentTools(counts,false)[0], AppMode.CABLE_FINDER);
  assert.equal(frequentTools(counts,false).includes(AppMode.SMART_CIRCUIT),false);
});

test('tool usage stays separate per account, ignores navigation and tolerates corrupt storage', () => {
  const previousStorage = globalThis.localStorage, previousWindow = globalThis.window;
  const data = new Map();
  globalThis.localStorage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  globalThis.window = {localStorage:globalThis.localStorage,dispatchEvent:()=>{}};
  try {
    recordToolUse(AppMode.ZS_CALCULATOR,'alice'); recordToolUse(AppMode.ZS_CALCULATOR,'alice');
    recordToolUse(AppMode.HOME,'alice'); recordToolUse(AppMode.CABLE_FINDER,'bob');
    assert.equal(readToolUsage('alice')[AppMode.ZS_CALCULATOR],2);
    assert.equal(readToolUsage('bob')[AppMode.ZS_CALCULATOR],0);
    assert.equal(readToolUsage('alice')[AppMode.HOME],undefined);
    data.set('sparkys.tool-usage.v1.alice','invalid'); assert.deepEqual(readToolUsage('alice'),{});
    clearToolUsage('bob'); assert.equal(readToolUsage('bob')[AppMode.CABLE_FINDER],0);
  } finally { globalThis.localStorage=previousStorage; globalThis.window=previousWindow; }
});

test('sync warnings group child failures once per project and keep profile separate', () => {
  const records = [
    {id:'p1',kind:'project',projectId:'',payload:{number:'001'},sync:'synced'},
    {id:'m1',kind:'materials',projectId:'p1',payload:{},sync:'error'},
    {id:'q1',kind:'quote',projectId:'p1',payload:{},sync:'error'},
    {id:'p2',kind:'project',projectId:'',payload:{number:'002'},sync:'pending'},
    {id:'s1',kind:'settings',projectId:'',payload:{},sync:'error'},
  ];
  const groups = projectSyncGroups(records);
  assert.deepEqual(groups.map(group=>group.label),['Project 001','Project 002','Business profile']);
  assert.equal(groups.find(group=>group.id==='p1').records.length,2);
  assert.match(syncGroupMessage(groups[0].records),/Saved on this device/);
  assert.doesNotMatch(syncGroupMessage(groups[0].records),/Firestore|Storage setup/);
  assert.deepEqual(projectSyncGroups(records.map(record=>({...record,sync:'synced'}))),[]);
});

test('grouped conflicts retain resolution records and do not masquerade as connection failures', () => {
  const records=[{id:'p',kind:'project',projectId:'',payload:{number:'001'},sync:'error'},
    {id:'q',kind:'quote',projectId:'p',payload:{},sync:'conflict'}];
  const groups=projectSyncGroups(records);
  assert.equal(groups.length,1);
  assert.equal(groups[0].records.filter(record=>record.sync==='conflict')[0].id,'q');
  assert.match(syncGroupMessage(groups[0].records),/another device need review/);
});

export const example = () => ({
  reference: "Q-001",
  revision: 1,
  type: "Quote",
  issueDate: "2026-10-17",
  validUntil: "2026-11-17",
  customer: {
    customer: "Example customer",
    title: "Kitchen rewire",
    address: "Example site",
    email: "",
    phone: "",
  },
  company: { ...M.blankCompany(), name: "Example Electrical" },
  scope: "Replace lighting",
  items: [
    {
      ...M.sellingItem(),
      description: "Lighting circuit",
      quantity: "2.5",
      rate: "19.99",
    },
  ],
  discount: "1.00",
  vatPercent: "20",
  terms: "Payment within 14 days",
  exclusions: "Decorating",
  notes: "",
  status: "Draft",
});
test("line pricing uses scaled integers and half-up rounding", () => {
  assert.equal(M.linePence("2.5", "19.99"), 4998);
  assert.equal(M.linePence("0.005", "1.00"), 1);
  assert.equal(M.linePence("1.001", "9.99"), 1000);
  assert.throws(() => M.linePence("-1", "10"));
  assert.throws(() => M.linePence("1", "1.999"));
});
test("non VAT registered quotes do not add VAT, even with a saved rate", () => {
  const q = example();
  assert.deepEqual(M.quoteTotals(q), {
    lines: [4998],
    subtotal: 4998,
    discount: 100,
    net: 4898,
    vat: 0,
    total: 4898,
  });
});
test("VAT is explicit, calculated after discount and rounded to a penny", () => {
  const q = example();
  q.company.vatRegistered = true;
  assert.equal(M.quoteTotals(q).vat, 980);
  assert.equal(M.quoteTotals(q).total, 5878);
  q.vatPercent = "0";
  assert.equal(M.quoteTotals(q).vat, 0);
  q.vatPercent = "101";
  assert.throws(() => M.quoteTotals(q));
  q.discount = "999";
  assert.throws(() => M.quoteTotals(q));
});
test("materials imports are independent and never copy costs into selling rates", () => {
  const source = {
    ...M.materialItem(),
    description: "Cable",
    quantity: "10",
    cost: "SECRET_COST",
    supplier: "PRIVATE_SUPPLIER",
  };
  const imported = M.importMaterials([source]);
  assert.equal(imported[0].rate, "0.00");
  source.description = "Changed";
  assert.equal(imported[0].description, "Cable");
  assert.equal(JSON.stringify(imported).includes("SECRET_COST"), false);
  assert.equal(JSON.stringify(imported).includes("PRIVATE_SUPPLIER"), false);
});
test("customer document allow-list excludes internal costs at all levels", () => {
  const q = example();
  q.items[0].cost = "PRIVATE_COST";
  q.customer.cost = "PRIVATE_COST";
  q.company.margin = "PRIVATE_MARGIN";
  const projection = JSON.stringify(M.customerDocument(q));
  assert.ok(!projection.includes("PRIVATE_COST"));
  assert.ok(!projection.includes("PRIVATE_MARGIN"));
});
test("issued revisions preserve originals and allow only status changes", () => {
  const q = example();
  q.status = "Sent";
  q.issuedAt = "2026-10-17T10:00:00Z";
  q.pdfId = "original-pdf";
  const original = structuredClone(q);
  const revision = M.revisionOf(q, [q, { ...q, revision: 3 }]);
  assert.equal(revision.revision, 4);
  assert.equal(revision.status, "Draft");
  assert.equal(revision.pdfId, undefined);
  revision.items[0].rate = "999";
  assert.deepEqual(q, original);
  assert.ok(M.immutableIssuedUpdate(q, { ...q, status: "Accepted" }));
  assert.ok(!M.immutableIssuedUpdate(q, { ...q, scope: "Changed" }));
});
test("calculation snapshots keep original values, references and version", () => {
  const original = {
    id: "c1",
    userId: "a",
    type: "circuit",
    title: "Original",
    createdAt: "2026-10-17",
    inputs: { lengthM: "20" },
    results: { cableSize: 4, dataSources: [{ id: "source" }] },
  };
  const saved = M.calculationSnapshot("Kitchen", original);
  const reopened = structuredClone(saved.snapshot);
  reopened.inputs.lengthM = "99";
  original.results.cableSize = 10;
  assert.equal(saved.snapshot.inputs.lengthM, "20");
  assert.equal(saved.snapshot.results.cableSize, 4);
  assert.deepEqual(saved.referenceMetadata, [{ id: "source" }]);
  assert.ok(saved.engineVersion);
});
test("project numbering preserves leading zeros and reference keys are deterministic", () => {
  assert.equal(
    M.nextProjectNumber([
      { payload: { number: "009" } },
      { payload: { number: "ABC" } },
    ]),
    "010"
  );
  assert.equal(M.quoteId("Q-001", 2), "quote-Q-001-r2");
  assert.throws(() => M.quoteId("../bad", 1));
});
test("calculation exports omit account IDs and support electrical symbols", async () => {
  const value = M.calculationSnapshot("Zs snapshot", {
    id: "PRIVATE_HISTORY_ID",
    userId: "PRIVATE_UID",
    type: "zs",
    title: "Loop impedance",
    createdAt: "2026-10-17",
    inputs: { ze: "0.35" },
    results: { label: "Zs \u2264 1.0 \u03a9" },
  });
  assert.ok(!JSON.stringify(M.calculationDocument(value)).includes("PRIVATE_"));
  const pdf = snapshotPdf(value.name, value);
  assert.ok(!(await pdf.text()).includes("PRIVATE_"));
  assert.ok(pdf.size > 1000);
});
test("materials totals accept unpriced lines but reject invalid quantities", () => {
  const list = {
    name: "Cable",
    notes: "",
    items: [
      { ...M.materialItem(), quantity: "2.5", cost: "1.99" },
      { ...M.materialItem(), cost: "" },
    ],
  };
  assert.equal(M.materialTotals(list), 498);
  list.items[0].quantity = "oops";
  assert.throws(() => M.materialTotals(list));
});
test("PDF exports are valid and reject unsupported text explicitly", async () => {
  const q = example();
  const pdf = quotePdf(q);
  assert.equal((await pdf.text()).slice(0, 8), "%PDF-1.3");
  assert.ok(pdf.size > 3000);
  assert.ok(
    materialsPdf(
      M.blankProject("01"),
      { name: "Materials", notes: "", items: [] },
      q.company
    ).size > 1000
  );
  q.scope = "\u4e2d";
  assert.throws(() => quotePdf(q), /Latin-script/);
});
