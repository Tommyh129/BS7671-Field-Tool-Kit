// Administrator workstation only; never expose this as a public endpoint.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { validateLicence, assertGrantEligible } from '../server/invoiced-licences.ts';

const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const manifest = value('--file');
if (!manifest) throw Error('Supply --file with a private licence manifest. Dry run is the default; --apply writes, --revoke revokes.');
const licence = validateLicence(JSON.parse(await readFile(manifest, 'utf8')));
const apply = args.includes('--apply'), revoke = args.includes('--revoke');
const actor = value('--actor');
if (apply && (!actor || actor.startsWith('--') || actor.length > 200)) throw Error('Supply --actor with an accountable administrator reference.');
const config = JSON.parse(await readFile(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
if (config.projectId !== 'bs7671fieldtoolkit') throw Error('Unexpected Firebase project; review the configuration first.');
initializeApp({projectId:config.projectId});
const db = config.firestoreDatabaseId ? getFirestore(config.firestoreDatabaseId) : getFirestore();
const ref = db.doc(`organisationLicences/${licence.licenceId}`);
if (!revoke && licence.memberUids.length) {
  const accounts = await getAuth().getUsers(licence.memberUids.map(uid => ({uid})));
  if (accounts.notFound.length || accounts.users.some(user => user.disabled)) throw Error('Every seat needs an existing, enabled Firebase Authentication account.');
}
const summary = await db.runTransaction(async tx => {
  const previous = (await tx.get(ref)).data();
  if (revoke && !previous) throw Error('Licence not found.');
  const members = revoke ? [] : licence.memberUids;
  const all = [...new Set([...(previous?.memberUids || []), ...members])];
  const profiles = new Map();
  for (const uid of all) {
    const userRef = db.doc(`users/${uid}`);
    const profile = (await tx.get(userRef)).data();
    const privacy = (await tx.get(db.doc(`privacyRequests/${uid}`))).data();
    if (members.includes(uid)) {
      if (privacy && ['processing','completed','retry-required'].includes(privacy.status)) throw Error('A seat is subject to an erasure lock.');
      assertGrantEligible(profile, licence.licenceId);
    }
    profiles.set(uid, {userRef, profile});
  }
  if (apply) {
    const updatedAt = new Date().toISOString();
    for (const uid of all) {
      const {userRef, profile} = profiles.get(uid);
      if (members.includes(uid)) tx.set(userRef, {invoicedBusiness:{licenceId:licence.licenceId, startsAt:licence.startsAt, expiresAt:licence.expiresAt, revoked:false}}, {merge:true});
      else if (profile?.invoicedBusiness?.licenceId === licence.licenceId) tx.update(userRef, {'invoicedBusiness.revoked':true});
    }
    tx.set(ref, {...(revoke ? previous : licence), memberUids:members, revoked:revoke, updatedAt, updatedBy:actor});
    tx.set(ref.collection('audit').doc(), {action:revoke?'revoke':'assign', seats:members.length, updatedAt, actor});
  }
  return {mode:apply?'applied':'dry-run', action:revoke?'revoke':'assign', seats:members.length, affectedAccounts:all.length};
});
console.log(JSON.stringify(summary));
