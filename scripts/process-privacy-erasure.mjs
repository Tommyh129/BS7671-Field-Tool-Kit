// Admin-only runbook tool. Never ship this script, credentials or server code in public assets.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const args = process.argv.slice(2);
const uid = args[args.indexOf('--uid') + 1];
if (!args.includes('--uid') || !uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('Supply --uid with a valid Firebase account UID.');
const config = JSON.parse(await readFile(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
initializeApp({ projectId: config.projectId });
const db = config.firestoreDatabaseId ? getFirestore(config.firestoreDatabaseId) : getFirestore();
const request = db.doc(`privacyRequests/${uid}`), user = db.doc(`users/${uid}`);
if (!(await request.get()).exists) throw Error('No recorded privacy request. Verify the requester before proceeding.');
if (!args.includes('--confirm-full-erasure')) {
  console.log('Dry run only. Full erasure requires --confirm-full-erasure --retention-reviewed --subscriptions-reviewed. Review the privacy runbook first.');
  process.exit(0);
}
if (!args.includes('--retention-reviewed') || !args.includes('--subscriptions-reviewed')) throw Error('Retention/legal holds and subscription handling must be reviewed first.');
try {
  await request.update({ status: 'processing', startedAt: new Date().toISOString() });
  await user.set({ deletionPending: true }, { merge: true });
  try {
    await getAuth().updateUser(uid, { disabled: true });
    await getAuth().revokeRefreshTokens(uid);
  } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  const bucket = getStorage().bucket(config.storageBucket);
  // Revoke outstanding direct-upload permits before deleting objects.
  await db.recursiveDelete(user.collection('storageReservations'));
  for (const prefix of [`business/${uid}/`, `invoices/${uid}/`, `rams/${uid}/`]) await bucket.deleteFiles({ prefix });
  const licences = await db.collection('organisationLicences').where('memberUids', 'array-contains', uid).get();
  for (const licence of licences.docs) await licence.ref.update({memberUids:FieldValue.arrayRemove(uid)});
  await db.recursiveDelete(user);
  try { await getAuth().deleteUser(uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  // Billing anti-replay claims remain separately restricted until their reviewed retention expires.
  await request.update({ status: 'completed', completedAt: new Date().toISOString() });
  console.log('Account, nested user records and business/invoice objects erased. Complete the external-provider, backup and request-log retention checklist.');
} catch {
  await request.update({ status: 'retry-required', failedAt: new Date().toISOString() }).catch(() => {});
  console.error('Erasure incomplete. Account remains locked where possible. Resolve access/service failures and rerun the same command. No completion has been reported.');
  process.exitCode = 1;
}
