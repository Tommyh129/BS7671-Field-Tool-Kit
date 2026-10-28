import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { auth, remote, files, controls } from "./business-fixtures.mjs";
import * as S from "../src/business/store.ts";
import { blankProject, calculationSnapshot } from "../src/business/model.ts";
import {newRams} from '../src/business/rams/model.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomeSummary from '../src/components/HomeSummary.tsx';

test('Home hides projects and displays Business benefits after four tools for non-Business users', () => {
  for (const pro of [false, true]) {
    const html = renderToStaticMarkup(createElement(HomeSummary, {business:false,pro,
      openProject:()=>{},openTool:()=>{},openProjects:()=>{},upgradeBusiness:()=>{}}));
    assert.doesNotMatch(html,/Upcoming Projects|Project scheduling is available/);
    assert.match(html,/Most Used Tools/);
    assert.match(html,/Upgrade to Business/);
    assert.match(html,/£14\.99\/month/);
    assert.match(html,/Quotes, estimates and invoices/);
    assert.match(html,/Editable risk assessments and method statements/);
    assert.equal((html.match(/<button/g)||[]).length,5);
    assert.ok(html.indexOf('Most Used Tools') < html.indexOf('Upgrade to Business'));
  }
});

test('Home retains projects and four tools without an upgrade banner for Business users', () => {
  const html = renderToStaticMarkup(createElement(HomeSummary, {business:true,pro:true,
    openProject:()=>{},openTool:()=>{},openProjects:()=>{},upgradeBusiness:()=>{}}));
  assert.match(html,/Upcoming Projects/);
  assert.match(html,/Most Used Tools/);
  assert.doesNotMatch(html,/Upgrade to Business/);
});
globalThis.window = new EventTarget();
globalThis.CustomEvent = class extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options?.detail;
  }
};
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: false },
  configurable: true,
});

test("durable local records, owner isolation, retry, conflict and cascade", async () => {
  const p = await S.saveBusiness(
    "owner-a",
    "project",
    "",
    { ...blankProject("001"), customer: "Sample", title: "Test" },
    "project-001"
  );
  await S.syncBusiness("owner-a");
  assert.equal((await S.readBusiness("owner-a"))[0].payload.number, "001");
  const read = await S.readBusiness("owner-a");
  read[0].payload.number = "999";
  assert.equal((await S.readBusiness("owner-a"))[0].payload.number, "001");
  auth.currentUser = { uid: "owner-b" };
  assert.equal((await S.readBusiness("owner-b")).length, 0);
  await assert.rejects(() => S.readBusiness("owner-a"), /own account/);
  await assert.rejects(
    () => S.saveBusiness("owner-a", "project", "", blankProject("02")),
    /own account/
  );
  await S.saveBusiness(
    "owner-b",
    "project",
    "",
    blankProject("001"),
    "project-001"
  );
  await S.syncBusiness("owner-b");
  auth.currentUser = { uid: "owner-a" };
  navigator.onLine = true;
  await S.syncBusiness("owner-a");
  assert.equal(remote.size, 1);
  assert.equal((await S.readBusiness("owner-a"))[0].sync, "synced");
  await S.syncBusiness("owner-a");
  assert.equal(remote.size, 1);
  assert.equal(remote.get("users/owner-a/business/project-001").revision, 1);
  navigator.onLine = false;
  await S.saveBusiness(
    "owner-a",
    "project",
    "",
    { ...p.payload, notes: "Local edit" },
    p.id
  );
  await S.syncBusiness("owner-a");
  remote.set("users/owner-a/business/project-001", {
    ...remote.get("users/owner-a/business/project-001"),
    revision: 2,
    mutationId: "other-device",
    payload: { ...p.payload, notes: "Remote edit" },
  });
  navigator.onLine = true;
  await S.syncBusiness("owner-a");
  assert.equal((await S.readBusiness("owner-a"))[0].sync, "conflict");
  assert.equal(
    (await S.readBusiness("owner-a"))[0].payload.notes,
    "Local edit"
  );
  await S.useCloudVersion("owner-a", p.id);
  const currentRemote = structuredClone(
    remote.get("users/owner-a/business/project-001")
  );
  remote.set("users/owner-a/business/project-001", {
    ...currentRemote,
    revision: 1,
    payload: { ...p.payload, notes: "Stale cache" },
  });
  await S.syncBusiness("owner-a");
  assert.equal(
    (await S.readBusiness("owner-a"))[0].payload.notes,
    "Remote edit"
  );
  remote.set("users/owner-a/business/project-001", currentRemote);
  assert.equal(
    (await S.readBusiness("owner-a"))[0].payload.notes,
    "Remote edit"
  );
  navigator.onLine = false;
  await S.saveBusiness(
    "owner-a",
    "materials",
    p.id,
    { name: "List", items: [], notes: "" },
    "list"
  );
  await S.syncBusiness("owner-a");
  navigator.onLine = true;
  controls.fail = true;
  await S.syncBusiness("owner-a");
  assert.equal(
    (await S.readBusiness("owner-a")).find((r) => r.id === "list").sync,
    "error"
  );
  controls.fail = false;
  await S.syncBusiness("owner-a");
  assert.equal(
    (await S.readBusiness("owner-a")).find((r) => r.id === "list").sync,
    "synced"
  );
  navigator.onLine = false;
  const file = await S.saveFile(
    "owner-a",
    p.id,
    new Blob(["photo"], { type: "image/jpeg" })
  );
  await S.saveBusiness(
    "owner-a",
    "photo",
    p.id,
    {
      caption: "Test",
      addedAt: "2026-10-17",
      imageId: file,
      thumbnailId: file,
    },
    "photo"
  );
  await S.syncBusiness("owner-a");
  navigator.onLine = true;
  await S.syncBusiness("owner-a");
  assert.equal(files.size, 1);
  assert.equal(await (await S.readFile("owner-a", p.id, file)).text(), "photo");
  const history = {
    id: "c",
    userId: "owner-a",
    type: "zs",
    title: "Zs",
    createdAt: "2026-10-17",
    inputs: {},
    results: {},
  };
  await S.saveBusiness(
    "owner-a",
    "calculation",
    p.id,
    calculationSnapshot("Zs", history),
    "calc"
  );
  await S.syncBusiness("owner-a");
  await assert.rejects(
    () =>
      S.saveBusiness(
        "owner-a",
        "calculation",
        p.id,
        calculationSnapshot("Changed", history),
        "calc"
      ),
    /immutable/
  );
  await assert.rejects(
    () => S.saveFile("owner-a", p.id, new Blob(["changed"]), file),
    /cannot be reused/
  );
  const pdfId = await S.saveFile(
    "owner-a",
    p.id,
    new Blob(["ORIGINAL_PDF"], { type: "application/pdf" })
  );
  const issued = {
    reference: "Q-issued",
    revision: 1,
    status: "Sent",
    issuedAt: "2026-10-17",
    pdfId,
    items: [{ rate: "10.00" }],
  };
  await S.saveBusiness("owner-a", "quote", p.id, issued, "quote-original");
  await S.syncBusiness("owner-a");
  await assert.rejects(
    () =>
      S.saveBusiness(
        "owner-a",
        "quote",
        p.id,
        { ...issued, items: [{ rate: "20.00" }] },
        "quote-original"
      ),
    /cannot be overwritten/
  );
  await assert.rejects(
    () => S.removeBusiness("owner-a", "quote-original"),
    /retained/
  );
  const revised = {
    ...issued,
    revision: 2,
    status: "Draft",
    items: [{ rate: "20.00" }],
  };
  delete revised.issuedAt;
  delete revised.pdfId;
  await S.saveBusiness("owner-a", "quote", p.id, revised, "quote-revised");
  await S.syncBusiness("owner-a");
  assert.equal(
    await (await S.readFile("owner-a", p.id, pdfId)).text(),
    "ORIGINAL_PDF"
  );
  assert.equal(
    (await S.readBusiness("owner-a")).find((r) => r.id === "quote-original")
      .payload.items[0].rate,
    "10.00"
  );
  await S.removeBusiness("owner-a", p.id);
  await S.syncBusiness("owner-a");
  await S.syncBusiness("owner-a");
  assert.ok((await S.readBusiness("owner-a")).every((r) => r.deleted));
  assert.equal(files.size, 0);
  assert.ok([...remote.values()].every((r) => r.deleted));
  auth.currentUser = { uid: "owner-b" };
  navigator.onLine = false;
  assert.equal((await S.readBusiness("owner-b"))[0].deleted, false);
  await S.syncBusiness("owner-b");
  auth.currentUser = null;
});

test('RAMS drafts persist with optimistic edit checks and retained projects cannot be deleted',async()=>{
  auth.currentUser={uid:'owner-a'};navigator.onLine=false;
  const project=await S.saveBusiness('owner-a','project','',blankProject('RAMS'),'rams-project');
  const draft=await S.saveBusiness('owner-a','ramsDraft',project.id,newRams(project.payload,{name:'QA business'}),'rams-draft');
  const changed=await S.saveBusiness('owner-a','ramsDraft',project.id,{...draft.payload,title:'Saved title'},draft.id,draft.mutationId);
  await assert.rejects(()=>S.saveBusiness('owner-a','ramsDraft',project.id,{...draft.payload,title:'Stale overwrite'},draft.id,draft.mutationId),/changed while/);
  assert.equal((await S.readBusiness('owner-a')).find(r=>r.id===draft.id).payload.title,'Saved title');
  await assert.rejects(()=>S.removeBusiness('owner-a',project.id),/Connect before deleting/);
  remote.set(`users/owner-a/ramsProjectLocks/${project.id}`,{retained:true});navigator.onLine=true;
  await assert.rejects(()=>S.removeBusiness('owner-a',project.id),/retained RAMS/);
  assert.equal(changed.ownerUid,'owner-a');navigator.onLine=false;
});
