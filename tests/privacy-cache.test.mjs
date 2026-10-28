import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { auth } from './business-fixtures.mjs';
import { saveBusiness, clearBusinessDeviceData, readBusiness } from '../src/business/store.ts';
import { blankProject } from '../src/business/model.ts';
import { clearInvoiceDeviceData } from '../src/business/invoices/client.ts';
import {ramsCache,clearRamsDeviceData,hasPendingRams,listPendingRams} from '../src/business/rams/client.ts';
globalThis.window = new EventTarget();
Object.defineProperty(globalThis, 'navigator', {value:{onLine:false}, configurable:true});

test('clearing device projects refuses unsynced changes without losing records', async () => {
  auth.currentUser={uid:'owner-a'};
  await saveBusiness('owner-a','project','',blankProject('001'),'private-project');
  await assert.rejects(()=>clearBusinessDeviceData('owner-a'),/Unsynced/);
  assert.equal((await readBusiness('owner-a')).length,1);
  auth.currentUser={uid:'owner-b'};
  await clearBusinessDeviceData('owner-b');
  auth.currentUser={uid:'owner-a'};
  assert.equal((await readBusiness('owner-a')).length,1);
  await assert.rejects(()=>clearBusinessDeviceData('owner-b'),/own account/);
});

const open = name => new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('cache');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
test('RAMS cache enforces owner access and never clears a pending issue or another account',async()=>{
  auth.currentUser={uid:'owner-a'};
  await ramsCache('owner-a','records',[{id:'original'}]);
  await ramsCache('owner-a','pending/original',{id:'original',body:{draft:'retained'}});
  assert.equal(await hasPendingRams('owner-a'),true);
  assert.deepEqual((await listPendingRams('owner-a')).map(p=>p.id),['original']);
  await assert.rejects(()=>clearRamsDeviceData('owner-a'),/pending RAMS/);
  auth.currentUser={uid:'owner-b'};await ramsCache('owner-b','records',[{id:'other-owner'}]);
  await assert.rejects(()=>ramsCache('owner-a','records'),/own account/);
  auth.currentUser={uid:'owner-a'};await ramsCache('owner-a','pending/original',undefined,true);await clearRamsDeviceData('owner-a');
  assert.equal(await ramsCache('owner-a','records'),undefined);
  auth.currentUser={uid:'owner-b'};assert.deepEqual(await ramsCache('owner-b','records'),[{id:'other-owner'}]);
});
const transaction = (database,store,action) => new Promise((resolve,reject)=>{const tx=database.transaction(store,'readwrite');action(tx.objectStore(store));tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});

test('synced device records are removed without deleting another account records', async()=>{
  auth.currentUser={uid:'owner-a'};
  const database=await open('sparkys-business-v1');
  await transaction(database,'records',store=>{
    store.put({key:'owner-a/private-project',ownerUid:'owner-a',sync:'synced'});
    store.put({key:'owner-b/private-project',ownerUid:'owner-b',sync:'synced'});
  });
  await clearBusinessDeviceData('owner-a');
  assert.equal((await readBusiness('owner-a')).length,0);
  auth.currentUser={uid:'owner-b'};
  assert.equal((await readBusiness('owner-b')).length,1);
});

test('invoice cache clearing preserves pending actions and other accounts', async()=>{
  auth.currentUser={uid:'owner-a'};
  const database=await open('sparkys-invoice-cache-v1');
  await transaction(database,'cache',store=>{
    store.put([{id:'a'}],'owner-a/invoices');
    store.put({invoiceId:'a',action:'issue'},'owner-a/pending');
    store.put([{id:'b'}],'owner-b/invoices');
  });
  await assert.rejects(()=>clearInvoiceDeviceData('owner-a'),/pending/);
  await transaction(database,'cache',store=>store.delete('owner-a/pending'));
  await clearInvoiceDeviceData('owner-a');
  const values=await new Promise(resolve=>{database.transaction('cache').objectStore('cache').getAllKeys().onsuccess=e=>resolve(e.target.result);});
  assert.deepEqual(values,['owner-b/invoices']);
});
