# Privacy safeguards and deployment runbook

Code changes are not a legal compliance certification. Complete this checklist before
using the Business features with real client records. No production rules, Termly
documents, backups, accounts or hosting settings were changed by this implementation.

## Implemented

- Root-profile admin access requires a Firebase Auth custom claim `admin: true`, not
  an editable Firestore role or an email-address shortcut. Clients cannot create or
  change role/admin/claims/deletionPending or change their profile UID.
- Project and history writes are blocked while an operator is processing erasure.
  Firestore also checks the private deletion tombstone; Storage requires an existing,
  unlocked user profile. Old tokens cannot recreate an erased profile or upload new files.
- Calculation history is filtered by account; account A cannot delete B's local entries.
- Settings exports private cloud records plus local business/history records. The
  export is NOT a client-specific SAR response: it contains internal costs and other
  clients' details. Raw billing proofs/tokens are excluded from the profile projection.
  Cloud files are listed, not embedded; original PDFs/images must be exported separately.
  Export is available without a Business subscription. Large exports require assistance.
- Settings can clear this account's project/file/invoice caches and local history.
  It refuses unsynced project records/files and pending financial actions. Other account
  caches are not deleted. Active sync must finish first. Cloud records can download again.
- Account deletion now records an idempotent, authenticated request for review. A
  refreshed token alone does not qualify: authentication must be within five minutes.
  The UI explicitly distinguishes request acceptance from completed deletion.
- Admin-only erasure script deletes nested user records and Storage objects, not just
  the Firestore parent document. Failures leave a retryable job and do not report success.
- Account emails/provider details and document paths are removed from the central
  Firestore error logger and normal authentication-state logs.
- Published legal documents and privacy contact can be configured without changing JSX.
  Legal URL configuration accepts HTTPS only. No third-party Termly scripts are injected.

## 1. Firebase Console: confirm the correct database and deploy rules

1. Open project `bs7671fieldtoolkit`. Under Firestore > Databases, open the database
   matching `firebase-applet-config.json` > `firestoreDatabaseId` (currently `(default)`).
   Do not put app records into an AI Studio database accidentally.
2. Review and deploy `firestore.rules` to that database and `storage.rules` to the app
   bucket. CLI alternative, after confirming the selected project:

   ```powershell
   firebase.cmd deploy --only firestore:rules,storage --project bs7671fieldtoolkit
   ```

3. Rules for `privacyRequests` intentionally deny all client reads/writes. The
   authenticated backend creates requests using the Admin SDK. Never add public access
   to this collection. Restrict Console, service accounts and support IAM separately;
   Firebase rules do not restrict Admin SDK access.
4. Review existing profiles for unexpected `role`, `admin`, or `claims` fields. Such
   fields no longer grant access. Grant legitimate staff claims ONLY through a trusted
   Admin SDK process; require MFA for staff and audit support access. Do not create an
   editable Firestore `role: admin` as an alternative.
5. Test in Firebase emulators: unauthenticated denied; A cannot read/write B's root,
   business, invoices, history or files; self-assigned roles and UID changes denied;
   legitimate owner reads allowed; processing-erasure writes denied. Static tests in
   this repo do not replace executing rules against the emulators.
6. Inventory regions for Firestore, Storage, Authentication, backups, logs and backend;
   review subprocessors/contracts/transfers. A European bucket is not a complete transfer
   assessment. Define backup/PITR expiration and prevent erased records being restored
   into service. Review Cloud Storage soft-delete/versioning and retention policies too.

## 2. Deploy the backend and operate deletion requests

Deploy `npm.cmd run build:server` output to the authenticated backend host, not public
web assets. It needs Application Default Credentials for the correct project/database,
restricted Firestore/Storage/Auth permissions and HTTPS. Do not include credentials in
VITE variables. Ensure the app's API base URL points at this updated host.

`POST /api/delete-account` now returns HTTP 202 with `accepted`, not `success`.
Old installed versions may not understand this response; coordinate release and provide
the privacy-support channel. Never restore the old partial-deletion route as a fallback.

Requests appear at `privacyRequests/{uid}` with `status: pending-review`. Monitor this
collection through an actual staffed workflow/alert. This implementation does NOT send
emails or schedule a worker. Assign an owner, deadlines and escalation. A Console-only
queue without monitoring is not sufficient. Access/complaints requests use the configured
Termly request URL or privacy mailbox, not this erasure queue.

For each request:

1. Verify requester and scope proportionately. Confirm exports and separate subscription
   cancellation. Account deletion alone does not stop Apple/Google/Stripe renewals.
2. Review legal holds and retention with the controller/accountant/legal adviser. If
   retention is required, tell the requester why and for how long, move only required
   records to an approved restricted archive with an expiry, then verify that archive.
   Do not simply leave a disabled user's entire database indefinitely. The script below
   is FULL erasure, not an archival or selective-retention engine.
3. Quiesce in-flight requests, webhooks and scheduled jobs for the account. Lock billing
   processing separately as needed; Admin SDK writes bypass Firebase rules. Ensure they
   cannot recreate user records after deletion. This requires backend operations and
   provider lifecycle configuration, not just database rules.
4. From the repository folder, with authorised Admin credentials, dry-run:

   ```powershell
   node scripts/process-privacy-erasure.mjs --uid VERIFIED_FIREBASE_UID
   ```

   Only after approving full erasure and any necessary external archive:

   ```powershell
   node scripts/process-privacy-erasure.mjs --uid VERIFIED_FIREBASE_UID --confirm-full-erasure --retention-reviewed --subscriptions-reviewed
   ```

   This locks the account, revokes refresh tokens, deletes `business/{uid}/` and
   `invoices/{uid}/` bucket objects, recursively deletes `users/{uid}`, then deletes Auth.
   Failure sets `retry-required`; rerun after fixing the issue. Do not delete a job first.
5. Verify actual deletion, device copies, provider data, logs, replicas and backup/soft
   delete expiry. Contact the requester with completion and any specific lawful exceptions.
   Completed request logs still contain a UID: apply an agreed retention/deletion schedule.
   Keep the minimal erasure tombstone through token expiry and backup replay windows;
   do not remove it before preventing replay. Storage rules currently reference `(default)`,
   so a database migration requires updating those cross-service lookups as well.
   Restricted `subscriptionClaims`, billing locks and provider billing records require
   their own fraud/legal-retention review; the script deliberately does not erase them.

## 3. Termly: prepare accurate legal documents

Use the actual operator legal/trading name, postal address and a monitored privacy contact.
Describe both app users and the clients whose records users upload. Confirm countries
served and applicable law with a qualified adviser, rather than selecting every law.

In the privacy notice cover:

- Account/authentication; purchases and entitlement identifiers; project/client names,
  addresses, contact details, notes/photos; quotes/invoices/payments; company logos and
  optional bank details; local caches; exports and support.
- Purpose and lawful basis per activity, controller vs processor roles, the customer's
  responsibility to inform their own clients, recipients/subprocessors, transfer safeguards.
- Actual retention per category, backups/soft deletion, review-based erasure, financial
  exceptions, account deletion vs subscription cancellation, rights and complaints route.
- Actual Firebase/Google/Apple/Stripe/backend and update-service usage. The regulatory
  AI lookup has a static standards-news prompt; do not claim it receives job/client data.
- Necessary storage vs any optional analytics/marketing technology. Do not add a cosmetic
  consent banner while optional tracking starts before a lawful choice. No new tracking
  or CMP has been added here. Assess any future SDKs before activation.

Update Terms for Business projects, customer responsibilities and export/retention.
Have an Article 28 controller/processor agreement reviewed for business customers.
A generic privacy-policy generator does not replace that agreement. Do not invent a
financial retention period or promise encryption that is not actually implemented.

Publish reviewed documents. Termly > Publish/Embed > URL gives a public hosted link that
displays the latest published document. Copy the real URLs, not an editor/dashboard URL.
If your plan offers a suitable rights-request portal, configure it; otherwise use the
monitored mailbox. Do not copy Termly's own company privacy notice as your policy.

## 4. Connect published documents to app builds

Set these in the local/build-host environment (see `.env.example`):

```dotenv
VITE_PRIVACY_POLICY_URL=https://YOUR-PUBLISHED-PRIVACY-URL
VITE_TERMS_URL=https://YOUR-PUBLISHED-TERMS-URL
VITE_DATA_PROCESSING_TERMS_URL=https://YOUR-REVIEWED-PROCESSOR-TERMS-URL
VITE_PRIVACY_REQUEST_URL=https://YOUR-OPTIONAL-REQUEST-PORTAL
VITE_PRIVACY_CONTACT_EMAIL=YOUR-MONITORED-PRIVACY-EMAIL
```

These are public build-time values, never API keys. Empty request URL uses the privacy
mailbox. Empty policy/terms URLs use existing in-app routes. Settings links use the
published URLs; Business Data Processing Terms appears only when configured. The
in-app data-handling summary is not automatically replaced by Termly content: review
its wording/version when data handling changes. Hosting updated Termly text does not
change app behaviour or provide consent for new purposes.

Rebuild with `npm.cmd run build`, then use the normal Capacitor asset sync and native
release workflow. Update App Store Connect privacy URL/App Privacy and Play Console
Data Safety/privacy URL/deletion URL to match the published notice and actual processing.
Test links before signing in on web, Android and iOS. Do not change subscription gating
to require users to accept optional tracking or register just to make a store purchase.

## Outstanding release gates

- This is not an encrypted-cache migration. Native Keychain/Keystore-backed encryption,
  optional app lock, secure logout/cache policy and screenshot/background treatment
  remain separate work; do not claim they exist. Exports saved/shared by users cannot
  be remotely recalled and are outside the cache-clear action.
- Automated category-specific retention, scoped client SAR export/redaction, restricted
  financial archive, backup lifecycle and provider erasure need reviewed requirements.
- Emulator permission tests, deployed-host API tests, real Android/iOS export/deletion
  tests and legal review are required before a privacy-readiness claim.
- Existing legacy Pro client-grant/test-email behaviour is not redesigned here. Treat
  trusted purchase verification and removal of production test grants as a separate
  billing-security review; this work does not certify entitlements against fraud.
- Maintain incident-response, rights/complaints, DPIA screening, records-of-processing,
  staff training, ICO registration/fee assessment and regular access reviews.

References: ICO controller/processor guidance
https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/controllers-and-processors/controllers-and-processors/
and Termly policy-link instructions
https://support.termly.io/hc/en-us/articles/30710533314961-How-to-embed-a-policy-on-your-website
