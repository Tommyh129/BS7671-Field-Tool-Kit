import type { Express } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const profileFields = ['uid', 'email', 'displayName', 'photoURL', 'createdAt', 'isPro', 'isBusiness', 'businessUntil', 'businessStripeUntil', 'invoicedBusiness'];
export function exportProfile(data: Record<string, unknown>) {
  return Object.fromEntries(profileFields.filter(key => key in data).map(key => [key, data[key]]));
}
export function recentAuthentication(authTime: number, now = Date.now()) {
  const age = now / 1000 - authTime;
  return Number.isFinite(age) && age >= -60 && age <= 300;
}

export function installPrivacyRoutes(app: Express, databaseId: string | undefined, bucketName: string, services = {
  db: databaseId ? getFirestore(databaseId) : getFirestore(), auth: getAuth(), bucket: getStorage().bucket(bucketName),
}) {
  const db = services.db;
  app.use(['/api/privacy', '/api/delete-account'], async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const token = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
    try {
      if (!token) throw Error();
      const identity = await services.auth.verifyIdToken(token, true);
      res.locals.privacyIdentity = identity;
      next();
    } catch { res.status(401).json({ error: 'Sign in again to access privacy controls.' }); }
  });

  app.get('/api/privacy/export', async (_req, res) => {
    try {
      const uid = res.locals.privacyIdentity.uid as string;
      const user = db.doc(`users/${uid}`);
      const records: Record<string, unknown> = {};
      // These user-owned records exclude raw store receipts, tokens and other accounts.
      for (const name of ['history', 'business', 'invoices', 'rams']) {
        const snapshot = await user.collection(name).limit(10001).get();
        if (snapshot.size > 10000) return res.status(413).json({ error: 'Contact privacy support for a larger assisted export.' });
        records[name] = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
      }
      const bucket = services.bucket;
      const files: { path: string; contentType?: string; size?: string | number }[] = [];
      for (const prefix of [`business/${uid}/`, `invoices/${uid}/`, `rams/${uid}/`]) {
        const [page, next] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 10001 });
        if (page.length > 10000 || next) return res.status(413).json({ error: 'Contact privacy support for a larger assisted export.' });
        for (const file of page) files.push({ path: file.name, contentType: file.metadata.contentType, size: file.metadata.size });
      }
      res.setHeader('Content-Disposition', 'attachment; filename="sparkys-private-records.json"');
      res.json({ format: 'sparkys-private-records-v1', exportedAt: new Date().toISOString(),
        warning: 'Private business export. Contains client details, bank details and internal costs. Files are listed, not embedded. Export original PDFs and images separately from Projects before deletion. This is not a client-specific subject access response.',
        profile: exportProfile((await user.get()).data() || {}), records, files });
    } catch { res.status(503).json({ error: 'The private export could not be completed. Connect and retry or contact privacy support.' }); }
  });

  app.post('/api/delete-account', async (req, res) => {
    const identity = res.locals.privacyIdentity;
    if (!recentAuthentication(identity.auth_time)) return res.status(401).json({ error: 'Sign in again immediately before requesting deletion.' });
    if (req.body?.financialExportAcknowledged !== true) return res.status(400).json({ error: 'Confirm that you have exported the records you need.' });
    try {
      const requestRef = db.doc(`privacyRequests/${identity.uid}`);
      await db.runTransaction(async tx => {
        const existing = await tx.get(requestRef);
        if (!existing.exists) tx.create(requestRef, {
          uid: identity.uid, type: 'account-erasure', status: 'pending-review', requestedAt: new Date().toISOString(),
        });
      });
      res.status(202).json({ accepted: true, message: 'Deletion request recorded for privacy review. Your account and records have not yet been deleted. You can still export them. Support will arrange erasure and explain any legally required retention. Deletion does not cancel an Apple, Google Play or web subscription; manage it with the original provider.' });
    } catch { res.status(503).json({ error: 'The deletion request could not be recorded. Please retry or contact privacy support.' }); }
  });
}
