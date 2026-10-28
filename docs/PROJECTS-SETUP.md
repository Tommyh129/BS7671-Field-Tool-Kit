# Projects Workspace

Projects is the fifth bottom navigation tab. It uses the existing Firebase login,
Firestore database `(default)` and configured Storage bucket. No subscription tier
or purchase logic was changed. A signed-in account is required for business records;
anonymous in-app purchasing remains independent of this requirement.

Invoices and credit notes have separate protected financial storage and a required
authenticated backend. See [Invoicing setup and retention](INVOICING.md) before
enabling them. Issued financial records do not cascade-delete with their project.

## Required Firebase Setup Before Release

These changes have NOT been deployed to Firebase by the coding task.

1. Select project `bs7671fieldtoolkit` in Firebase Console. Enable Cloud Storage
   and use the bucket in `firebase-applet-config.json`. Confirm billing requirements
   in your Firebase account. Do not create a public bucket or use test-mode rules.
2. Review and deploy `firestore.rules` and `storage.rules`. The new business data
   is under `users/{uid}/business/{recordId}`. Uploaded files are under
   `business/{uid}/{projectId}/{fileId}`; logos use `_settings` as the folder.
   Existing profile/history rules are preserved. Business paths only allow the
   authenticated owner. Cloud Storage's Firestore lookup may require enabling its
   cross-service permissions when prompted during deployment.
3. With Firebase CLI installed and signed in to the correct account, run from the
   repository root:

   ```powershell
   firebase deploy --project bs7671fieldtoolkit --only "firestore:rules,storage"
   ```

   Alternatively publish each rules file in the corresponding Firebase Console
   Rules editor. Review any existing bucket rules first: the new Storage file
   intentionally only grants access to business files and denies other paths.

4. Configure bucket CORS for authenticated browser `getBlob` downloads. Copy
   `docs/storage-cors.example.json`, add your exact production web origin if any,
   then use Google Cloud CLI:

   ```powershell
   gcloud storage buckets update gs://bs7671fieldtoolkit.firebasestorage.app --cors-file=docs/storage-cors.example.json
   ```

   The example includes the existing local preview and Capacitor default Android
   and iOS origins. If your Capacitor hostname/scheme differs, use the actual
   origin. CORS is not an access rule; owner-only Firebase rules still apply.
   See [Firebase authenticated downloads and CORS](https://firebase.google.com/docs/storage/web/download-files#cors_configuration)
   and [Storage rules / Firestore access](https://firebase.google.com/docs/reference/security/storage#firestoreget).

5. Rebuild the web bundle and sync each native platform using `npm.cmd run build`
   and `npx.cmd cap sync`. iOS Info.plist includes camera/photo-library purpose
   strings. Camera/library selection uses the system HTML file picker only after
   a user taps it. No always-on camera permission or new native plugin is added.
   On Windows an iOS archive and real-device camera validation cannot be performed.

## Data and Reliability

- New additive schema: no existing data migration is required. Each record stores
  kind, immutable owner/project association, payload, revision, timestamps,
  deletion tombstone and unique mutation ID. Project numbers are strings.
- Device records and compressed files are durably committed in IndexedDB before
  the UI confirms a local save. IndexedDB keys include the authenticated UID.
- Device saves work offline. Files from another device must be downloaded at least
  once before they can be opened offline. Clearing site/app data removes unsynced
  work. Use Export local backup before clearing storage or resolving a conflict.
- Synchronisation runs on opening Projects, on connectivity returning, every
  minute while Projects is open, and after saving. Retry sync is also available.
  Mutations are idempotent and revision-checked. Concurrent edits retain the local
  copy and require explicit conflict resolution; they are not silently overwritten.
- The JSON backup contains business/customer data and is an export, not an import
  or automatic restore feature. Keep it private. Customer details are not logged.
- Sent/Accepted documents freeze their company/customer/pricing values and retain
  their PDF. New revisions have new deterministic reference/revision IDs. Only
  status can change on an issued record. Project deletion authorises removal of
  all child documents/files; issued PDFs otherwise cannot be overwritten/deleted.
- Photos: JPEG recompression, maximum 1600 px, separate 256 px thumbnails, no
  retained EXIF metadata. Input limit 25 MB, stored file limit 8 MB. HEIC is accepted
  only if the device browser can decode it; otherwise a clear JPEG/PNG message is
  displayed. Business logos accept PNG/JPEG up to 5 MB, are optimised to at most
  1200 px, and preserve PNG transparency and aspect ratio. See
  [Business Profile and document branding](BUSINESS-PROFILE.md).
- GBP arithmetic uses integer pence and half-up line/VAT rounding. Quantities allow
  3 decimals; money and VAT percentages allow 2. VAT is off by default and discount
  is a fixed GBP amount deducted before VAT. Imported materials start with a zero
  selling rate, never the internal cost. Review rates before issuing documents.
- Calculation snapshots retain their exact saved inputs/results and available
  dataset metadata, with engine identifier `electrical-reference-engine/2026-10-17`.
  Increment this identifier when the underlying calculation engine changes.
  AC voltage-drop and cable-finder snapshots support reopening as a new draft.
  Other calculators retain view/PDF export but do not yet restore form inputs.
  Saving does not certify compliance or update old calculations.
- PDFs currently support Latin-script/WinAnsi text; unsupported scripts show an
  explicit export error rather than a corrupted document. Native PDF actions use
  the existing Filesystem/share sheet; web actions download a PDF.
- This release does not add teams, email delivery, electronic signatures or a
  recoverable trash. Deletion requires confirmation and completes cloud cleanup
  when connected. Keep app access until pending deletion has synced.

## Verification

A synthetic project numbered `001` was created manually in the live preview for
browser QA. Its sample materials, photo, quote revisions and calculation are real
local records, not data seeded into released builds.

Run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build`.
The business service test uses fake IndexedDB and a test-only Firestore/Storage
adapter. It exercises persistence, owner isolation, duplicate-free retry, conflicts,
immutable snapshots, file lifecycle and cascading deletion; it does NOT replace
testing deployed Firebase rules. Financial tests cover rounding, both VAT modes,
materials imports, issued revisions and customer-document field allow-lists.

`node --import ./scripts/register-test-loader.mjs scripts/check-business-pdfs.mjs`
creates synthetic quote/materials PDFs under ignored `build/business-qa` for visual
QA. Never use real customer details in fixtures.

Before public release, use two Firebase test accounts and two devices to verify:
owner-only document/file access, upload/download/delete after deploying rules,
offline edit/reconnect conflicts, original issued PDFs, camera denied/allowed,
native sharing, and an existing purchase/restore flow. Firebase emulator rules
tests and real Android/iOS device flows were not run by this task.
