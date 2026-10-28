import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  runTransaction,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getBlob,
  getMetadata,
  deleteObject,
  listAll,
} from "firebase/storage";
import { auth, db } from "../firebase";
import { optimiseLogo } from "./logo";
import { reserveBusinessUpload } from './storage-allowance';
import {
  BusinessRecord,
  BusinessPayloads,
  Kind,
  immutableIssuedUpdate,
  Quote,
  JobPhoto,
  Company,
} from "./model";

interface StoredFile {
  key: string;
  id: string;
  ownerUid: string;
  projectId: string;
  blob: Blob;
  uploaded: boolean;
}
const EVENT = "sparkys-business-updated";
let opening: Promise<IDBDatabase>;
const activeSync = new Map<string, Promise<void>>();
const clearing = new Set<string>();
const requireOwner = (uid: string) => {
  if (!uid || auth.currentUser?.uid !== uid)
    throw new Error("Sign in to your own account to access projects.");
  if (clearing.has(uid)) throw new Error('Device data is being cleared. Retry shortly.');
};
function openDB() {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open("sparkys-business-v1", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("records", { keyPath: "key" });
        request.result.createObjectStore("files", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new Error(
            "Device storage is unavailable. Enable site storage and try again."
          )
        );
    });
  return opening;
}
async function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = action(tx.objectStore(store));
    let value: T;
    request.onsuccess = () => {
      value = request.result;
    };
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          "Could not save on this device. Check available storage; the change was not saved."
        )
      );
  });
}
const notify = () => window.dispatchEvent(new Event(EVENT));

export async function clearBusinessDeviceData(uid: string) {
  requireOwner(uid);
  if (activeSync.has(uid)) throw Error('Project sync is running. Wait until it finishes before clearing device data.');
  clearing.add(uid);
  try {
    const database = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['records', 'files'], 'readwrite');
      let unsafe = false;
      for (const name of ['records', 'files']) {
        const request = tx.objectStore(name).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const value = cursor.value;
          if (value.ownerUid === uid) {
            if (name === 'records' ? value.sync !== 'synced' : !value.uploaded) {
              unsafe = true; tx.abort(); return;
            }
            cursor.delete();
          }
          cursor.continue();
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(Error(unsafe ? 'Unsynced changes or files exist. Sync or export them before clearing this device.' : 'Device data could not be cleared.'));
    });
    notify();
  } finally { clearing.delete(uid); }
}
export const subscribeBusiness = (listener: () => void) => {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const key = (uid: string, id: string) => `${uid}/${id}`;
const recordRef = (uid: string, id: string) =>
  doc(db, "users", uid, "business", id);
const storagePath = (uid: string, projectId: string, id: string) =>
  `business/${uid}/${projectId || "_settings"}/${id}`;
export async function readBusiness(uid: string): Promise<BusinessRecord[]> {
  requireOwner(uid);
  const all = await transact<(BusinessRecord & { key: string })[]>(
    "records",
    "readonly",
    (s) => s.getAll()
  );
  return all.filter((record) => record.ownerUid === uid);
}
async function writeLocal(record: BusinessRecord) {
  await transact("records", "readwrite", (s) =>
    s.put({ ...record, key: key(record.ownerUid, record.id) })
  );
  notify();
}
export async function saveBusiness<K extends Kind>(
  uid: string,
  kind: K,
  projectId: string,
  payload: BusinessPayloads[K],
  id: string = crypto.randomUUID(),
  expectedMutationId?: string
): Promise<BusinessRecord<K>> {
  requireOwner(uid);
  const all = await readBusiness(uid);
  const before = all.find((record) => record.id === id);
  if (kind === 'ramsDraft' && before?.sync === 'conflict') throw Error('This RAMS draft changed on another device. Resolve the conflict before editing.');
  if (
    before?.kind !== undefined &&
    (before.kind !== kind || before.projectId !== projectId || before.deleted)
  )
    throw new Error("This record reference is already in use.");
  if (
    projectId &&
    kind !== "project" &&
    !all.some(
      (record) =>
        record.id === projectId && record.kind === "project" && !record.deleted
    )
  )
    throw new Error("The project is unavailable or was deleted.");
  if (
    kind === "quote" &&
    before &&
    !immutableIssuedUpdate(before.payload as Quote, payload as Quote)
  )
    throw new Error(
      "Issued documents cannot be overwritten. Create a new revision."
    );
  if (kind === "calculation" && before)
    throw new Error(
      "Saved calculations are immutable. Save a new snapshot instead."
    );
  const json = clean(payload);
  if (new Blob([JSON.stringify(json)]).size > 850000)
    throw new Error(
      "This record is too large. Split it into smaller lists or documents."
    );
  const now = new Date().toISOString();
  const record: BusinessRecord<K> = {
    id,
    ownerUid: uid,
    projectId,
    kind,
    payload: json,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
    baseRevision: before?.baseRevision ?? 0,
    mutationId: crypto.randomUUID(),
    sync: "pending",
    deleted: false,
  };
  if (expectedMutationId !== undefined) {
    const database=await openDB();
    await new Promise<void>((resolve,reject)=>{
      const tx=database.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.get(key(uid,id));
      let conflict=false;
      read.onsuccess=()=>{if(read.result?.mutationId!==expectedMutationId){conflict=true;tx.abort();return;}store.put({...record,key:key(uid,id)});};
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error(conflict?'This RAMS draft changed while you were editing. Reload or keep a separate copy.':'The draft could not be saved on this device.'));
    });
    notify();
  } else await writeLocal(record);
  void syncBusiness(uid);
  return record;
}
export async function removeBusiness(uid: string, id: string, cascade = false) {
  requireOwner(uid);
  const all = await readBusiness(uid);
  const record = all.find((item) => item.id === id);
  if (!record) throw new Error("Record not found.");
  if(record.kind==='project') {
    if(!navigator.onLine)throw Error('Connect before deleting a project so retained RAMS can be checked. You can archive the project offline.');
    const retained=await getDoc(doc(db,'users',uid,'ramsProjectLocks',id));
    if(retained.exists())throw Error('This project contains retained RAMS. Archive it instead. Permanent removal needs an explicit records-management/privacy review.');
  }
  if (record.kind === "quote" && (record.payload as Quote).issuedAt && !cascade)
    throw new Error(
      "Issued documents are retained. Delete their project only if all its content is no longer needed."
    );
  const records =
    record.kind === "project"
      ? all.filter((item) => item.id === id || item.projectId === id)
      : [record];
  // One transaction makes an offline project deletion durable as a whole.
  const database = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("records", "readwrite");
    for (const item of records)
      tx.objectStore("records").put({
        ...item,
        key: key(uid, item.id),
        deleted: true,
        sync: "pending",
        mutationId: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      });
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(new Error("Deletion was not saved. Try again."));
  });
  notify();
  void syncBusiness(uid);
}
export async function saveFile(
  uid: string,
  projectId: string,
  blob: Blob,
  id: string = crypto.randomUUID()
) {
  requireOwner(uid);
  if (blob.size > 8 * 1024 * 1024)
    throw new Error("File is too large after compression.");
  if (
    await transact<StoredFile>("files", "readonly", (s) => s.get(key(uid, id)))
  )
    throw new Error(
      "File references cannot be reused. Save a new file instead."
    );
  await transact("files", "readwrite", (s) =>
    s.put({
      key: key(uid, id),
      id,
      ownerUid: uid,
      projectId,
      blob,
      uploaded: false,
    } satisfies StoredFile)
  );
  return id;
}
export async function readFile(
  uid: string,
  projectId: string,
  id: string
): Promise<Blob> {
  requireOwner(uid);
  const cached = await transact<StoredFile>("files", "readonly", (s) =>
    s.get(key(uid, id))
  );
  if (cached) return cached.blob;
  if (!navigator.onLine)
    throw new Error(
      "This file has not been downloaded to this device. Connect to load it."
    );
  const blob = await getBlob(
    ref(getStorage(), storagePath(uid, projectId, id)),
    8 * 1024 * 1024
  );
  requireOwner(uid);
  await transact("files", "readwrite", (s) =>
    s.put({
      key: key(uid, id),
      id,
      ownerUid: uid,
      projectId,
      blob,
      uploaded: true,
    })
  );
  return blob;
}
function assetIds(record: BusinessRecord): string[] {
  if (record.kind === "photo") {
    const p = record.payload as JobPhoto;
    return [p.imageId, p.thumbnailId];
  }
  if (record.kind === "settings")
    return (record.payload as Company).logoId
      ? [(record.payload as Company).logoId]
      : [];
  if (record.kind === "quote")
    return (record.payload as Quote).pdfId
      ? [(record.payload as Quote).pdfId]
      : [];
  return [];
}
async function uploadFile(
  uid: string,
  projectId: string,
  id: string,
  record: BusinessRecord
) {
  requireOwner(uid);
  const file = await transact<StoredFile>("files", "readonly", (s) =>
    s.get(key(uid, id))
  );
  if (!file || file.uploaded) return;
  const target = ref(getStorage(), storagePath(uid, projectId, id));
  try {
    const existing = await getMetadata(target);
    if (
      existing.size !== file.blob.size ||
      existing.customMetadata?.recordId !== record.id ||
      existing.customMetadata?.kind !== record.kind
    )
      throw new Error(
        "Stored file differs from the pending upload. Keep your local backup and contact support."
      );
    await transact("files", "readwrite", (s) =>
      s.put({ ...file, uploaded: true })
    );
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== "storage/object-not-found")
      throw error;
  }
  await reserveBusinessUpload(uid,id,projectId,file.blob.size,record.id,record.kind);
  requireOwner(uid);
  await uploadBytes(target, file.blob, {
    contentType: file.blob.type,
    customMetadata: { recordId: record.id, kind: record.kind },
  });
  await transact("files", "readwrite", (s) =>
    s.put({ ...file, uploaded: true })
  );
}
async function deleteAsset(uid: string, projectId: string, id: string) {
  try {
    await deleteObject(ref(getStorage(), storagePath(uid, projectId, id)));
  } catch (e) {
    if ((e as { code?: string }).code !== "storage/object-not-found") throw e;
  }
  await transact("files", "readwrite", (s) => s.delete(key(uid, id)));
}
async function cascadeCloud(uid: string, projectId: string) {
  const remote = await getDocs(
    query(
      collection(db, "users", uid, "business"),
      where("projectId", "==", projectId)
    )
  );
  const local = await readBusiness(uid);
  for (const item of remote.docs) {
    const data = item.data();
    if (data.deleted) continue;
    const before = local.find((record) => record.id === item.id);
    await writeLocal({
      ...data,
      ...before,
      id: item.id,
      ownerUid: uid,
      baseRevision: data.revision,
      sync: "pending",
      deleted: true,
      mutationId: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    } as BusinessRecord);
  }
  const files = await listAll(
    ref(getStorage(), `business/${uid}/${projectId}`)
  );
  for (const file of files.items) await deleteAsset(uid, projectId, file.name);
  const cached = await transact<StoredFile[]>("files", "readonly", (s) =>
    s.getAll()
  );
  for (const file of cached.filter(
    (file) => file.ownerUid === uid && file.projectId === projectId
  ))
    await transact("files", "readwrite", (s) => s.delete(file.key));
}
export function syncBusiness(uid: string): Promise<void> {
  if (activeSync.has(uid)) return activeSync.get(uid)!;
  const work = (async () => {
    if (!navigator.onLine || auth.currentUser?.uid !== uid) return;
    try {
      let records = await readBusiness(uid);
      // Parent tombstones first: they prohibit new child writes and authorise cleanup.
      const pending = records
        .filter((r) => r.sync !== "synced" && r.sync !== "conflict")
        .sort(
          (a, b) => Number(b.kind === "project") - Number(a.kind === "project")
        );
      for (const record of pending) {
        requireOwner(uid);
        try {
          for (const id of assetIds(record)) {
            if (!record.deleted)
              await uploadFile(uid, record.projectId, id, record);
          }
          const revision = await runTransaction(db, async (tx) => {
            const target = recordRef(uid, record.id);
            const remote = await tx.get(target);
            const data = remote.data();
            if (data?.mutationId === record.mutationId)
              return data.revision as number;
            if ((data?.revision ?? 0) !== record.baseRevision)
              throw new Error("BUSINESS_CONFLICT");
            const next = record.baseRevision + 1;
            tx.set(target, {
              id: record.id,
              ownerUid: uid,
              projectId: record.projectId,
              kind: record.kind,
              payload: record.deleted ? {} : record.payload,
              createdAt: record.createdAt,
              updatedAt: record.updatedAt,
              revision: next,
              mutationId: record.mutationId,
              deleted: record.deleted,
            });
            return next;
          });
          if (record.deleted && record.kind === "project")
            await cascadeCloud(uid, record.id);
          else if (record.deleted)
            for (const id of assetIds(record))
              await deleteAsset(uid, record.projectId, id);
          const latest = (await readBusiness(uid)).find(
            (item) => item.id === record.id
          );
          if (latest)
            await writeLocal({
              ...latest,
              baseRevision: revision,
              sync:
                latest.mutationId === record.mutationId ? "synced" : "pending",
              error: undefined,
              ...(record.deleted && latest.mutationId === record.mutationId
                ? { payload: {} as never }
                : {}),
            });
        } catch (error) {
          const latest = (await readBusiness(uid)).find(
            (item) => item.id === record.id
          );
          if (latest?.mutationId === record.mutationId)
            await writeLocal({
              ...latest,
              sync:
                (error as Error).message === "BUSINESS_CONFLICT"
                  ? "conflict"
                  : "error",
              error:
                (error as Error).message === "BUSINESS_CONFLICT"
                  ? "Changed on another device. Your local changes are retained; resolve before retrying."
                  : (error as Error).message?.startsWith('Business storage is full') ? (error as Error).message
                  : "Cloud sync failed. Your copy is saved on this device. Check access rules, Storage setup and your connection, then retry.",
            });
        }
      }
      const remote = await getDocs(collection(db, "users", uid, "business"));
      const local = await readBusiness(uid);
      for (const item of remote.docs) {
        requireOwner(uid);
        const before = local.find((record) => record.id === item.id);
        if (before && before.sync !== "synced") continue;
        const data = item.data();
        if (before && data.revision < before.baseRevision) continue;
        await writeLocal({
          ...data,
          id: item.id,
          ownerUid: uid,
          baseRevision: data.revision,
          sync: "synced",
        } as BusinessRecord);
      }
      window.dispatchEvent(
        new CustomEvent("sparkys-business-sync-complete", { detail: uid })
      );
    } catch {
      // Customer/project details never enter diagnostic logs.
      window.dispatchEvent(
        new CustomEvent("sparkys-business-sync-error", {
          detail:
            "Cloud connection unavailable. Local changes remain on this device; check Firebase rules and Storage setup.",
        })
      );
    }
  })().finally(async () => {
    activeSync.delete(uid);
    if (auth.currentUser?.uid === uid && navigator.onLine) {
      try {
        if (
          (await readBusiness(uid)).some((record) => record.sync === "pending")
        )
          setTimeout(() => {
            void syncBusiness(uid);
          }, 15000);
      } catch {
        /* Storage error is shown by the next foreground read. */
      }
    }
  });
  activeSync.set(uid, work);
  return work;
}
export async function useCloudVersion(uid: string, id: string) {
  requireOwner(uid);
  const remote = await getDoc(recordRef(uid, id));
  if (!remote.exists())
    throw new Error(
      "Cloud record unavailable. Export your local backup before retrying."
    );
  const data = remote.data();
  await writeLocal({
    ...data,
    id,
    ownerUid: uid,
    baseRevision: data.revision,
    sync: "synced",
  } as BusinessRecord);
}

async function resizedImage(
  blob: Blob,
  max: number,
  quality: number
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      max / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Image conversion failed.")),
        "image/jpeg",
        quality
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function addPhoto(
  uid: string,
  projectId: string,
  file: File,
  caption: string
) {
  if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024)
    throw new Error("Choose an image smaller than 25 MB.");
  let image: Blob, thumb: Blob;
  try {
    image = await resizedImage(file, 1600, 0.82);
    thumb = await resizedImage(image, 256, 0.7);
  } catch {
    throw new Error(
      "Could not open this image. Choose JPEG, PNG or WebP, and check camera/photo access in device settings."
    );
  }
  const imageId = await saveFile(uid, projectId, image);
  const thumbnailId = await saveFile(uid, projectId, thumb);
  return saveBusiness(uid, "photo", projectId, {
    caption,
    addedAt: new Date().toISOString(),
    imageId,
    thumbnailId,
  });
}
export async function companyLogo(uid: string, file: File) {
  requireOwner(uid);
  return saveFile(uid, "", await optimiseLogo(file));
}
