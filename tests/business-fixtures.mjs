// Test-only service adapters. Production code never imports these.
export const auth = { currentUser: { uid: "owner-a" } };
export const db = {};
export const remote = new Map();
export const files = new Map();
export const controls = { fail: false };
export const reserveBusinessUpload = async () => {};
export const doc = (_db, ...parts) => parts.join("/");
export const collection = doc;
export const where = (field, op, value) => ({ field, value });
export const query = (path, filter) => ({ path, filter });
const snapshot = (id, value) => ({
  id,
  exists: () => !!value,
  data: () => structuredClone(value),
});
export async function getDoc(path) {
  if (controls.fail) throw Error("Offline test");
  return snapshot(path.split("/").at(-1), remote.get(path));
}
export async function getDocs(input) {
  if (controls.fail) throw Error("Offline test");
  const path = typeof input === "string" ? input : input.path;
  return {
    docs: [...remote.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(path + "/") &&
          (!input.filter || value[input.filter.field] === input.filter.value)
      )
      .map(([key, value]) => snapshot(key.split("/").at(-1), value)),
  };
}
export async function runTransaction(_db, fn) {
  if (controls.fail) throw Error("Offline test");
  return fn({
    get: getDoc,
    set: (path, value) => remote.set(path, structuredClone(value)),
  });
}
export const getStorage = () => ({});
export const ref = (_storage, path) => ({ path, name: path.split("/").at(-1) });
export async function uploadBytes(target, blob, metadata) {
  if (controls.fail) throw Error("Offline test");
  files.set(target.path, { blob, metadata });
}
export async function getBlob(target) {
  if (!files.has(target.path)) throw Error("Not found");
  return files.get(target.path).blob;
}
export async function getMetadata(target) {
  if (controls.fail) throw Error("Offline test");
  if (!files.has(target.path))
    throw Object.assign(Error("Not found"), {
      code: "storage/object-not-found",
    });
  const { blob, metadata } = files.get(target.path);
  return { size: blob.size, customMetadata: metadata.customMetadata };
}
export async function deleteObject(target) {
  files.delete(target.path);
}
export async function listAll(target) {
  return {
    items: [...files.keys()]
      .filter((path) => path.startsWith(target.path + "/"))
      .map((path) => ref(null, path)),
  };
}
