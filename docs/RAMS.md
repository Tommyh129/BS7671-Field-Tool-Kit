# Project RAMS builder

## Implemented behaviour

- Each project has a RAMS section, separate from quotes, invoices and other records.
  Multiple named documents have their own identity, reference, revision, status, author
  and updated date. Search and status filtering include retained external attachments.
- Drafts auto-save to the existing authenticated owner's IndexedDB business store and
  sync using the existing optimistic cloud revision checks. Simultaneous local edits
  also compare mutation IDs. A save failure is visible; the editor warns before leaving
  the page with an unfinished save. Save and close waits for device persistence.
- Draft project/business details are editable snapshots. Financial settings and bank
  details are not imported into RAMS. Existing branding and aspect-preserving logos are
  reused; no logo is required.
- Hazards have freely editable tasks, descriptions, affected persons, controls, further
  actions, responsibility, due dates and completion. Add/remove/reorder is supported.
  Initial/residual scoring is optional, starts unselected and has visible definitions
  and a 5x5 matrix. No score automatically authorises work or establishes safety.
- Method sections contain neutral headings only. Optional sections can be renamed,
  reordered, removed or marked not applicable. Scope and work sequence are mandatory
  on issue. Sections can link to stable hazard IDs; reordering preserves those links.
- Private user templates and duplication create new drafts/references. New revisions
  retain their family/reference and advance the revision number. Reviewer details,
  review confirmations and all briefing/signature records are cleared on copies.
  Copied site details, dates, contacts and controls require an explicit review checkbox.
- Draft/Ready for Review remain editable. Issue validates identification, scope,
  assessment fields, method sections, optional scoring and briefing completeness.
  Outstanding further actions require responsible people/dates and explicit user
  acknowledgement. The task/site declaration records the authenticated UID, entered
  confirmer name and timestamp; it is not independent approval or competence checking.
- Optional briefing entries and authorised PNG/JPEG signature images are part of the
  specific revision's snapshot. They record acknowledgement, not verified identity,
  competence or guaranteed understanding. They are entered before issue; changing them
  afterwards requires a new revision. This is not a shared electronic-signature service.
- Issue first retains a Preparing reservation and fixed snapshot; only after the PDF
  is stored does it become Issued. Retries use the same identity, canonical content hash
  and immutable object path. Competing revisions cannot both supersede one predecessor.
  A failed replacement does not supersede the prior issued version. Earlier PDFs and
  snapshots remain unchanged; Superseded is retained metadata in the list.
- Originals are downloaded from private server-owned Storage objects, then cached for
  offline viewing. Branded generated PDFs have page numbers, repeating table headings,
  long-row pagination, draft watermarks, preparer/reviewer data and the responsibility
  note. They use the existing app's Latin-script font support and validation.
  Lapsed subscribers also retain a private RAMS/original-PDF export in Business Archive.
- External PDFs are explicitly labelled externally prepared and unverified. They are
  retained unchanged, not edited/watermarked/approved by the app. Basic PDF header/EOF
  and size checks are not a malware scan or a review of safety content.
- Projects with issued or Preparing RAMS/retained attachments cannot be cascade-deleted.
  Archive them instead. Ordinary project deletion now requires an online retention
  check; offline archiving still works. A privacy/records-management review is needed
  for permanent erasure, not a normal app delete button.

## Storage budget and uploads

The prior app had an 8 MB per-file cap but no account-wide budget. The server now has
`BUSINESS_STORAGE_LIMIT_BYTES`, default 104857600 (100 MiB), as a configurable technical
guard. Set the actual intended allowance before release and document it in product
terms; this implementation does not silently advertise a commercial entitlement.

The budget counts actual objects under business, invoice and RAMS prefixes, plus
active unuploaded reservations, deduplicated by object path. Capacity is checked before
new files are stored. Existing originals can still be viewed/exported when full.
Draft records can still be saved without creating a PDF.

Direct business uploads now request an authenticated server permit. Storage rules check
its owner, path, size, record, kind and expiry, plus the active parent. Backend-generated
invoice/RAMS files use the same reservation mechanism. An abandoned reservation stops
charging after 15 minutes; subsequent requests prune up to 200 expired metadata records.
An uploaded object is counted once, even if the final document commit must be retried.
Files from incomplete issues are intentionally retained for recovery, not swept blindly.
Actual orphan files require a reviewed cleanup process: do not delete old logos or PDFs
merely because the current profile no longer points at them. Historical snapshots can
still refer to them. Inventory is bounded to 5000 objects per prefix/reservations; support
must handle larger accounts with a paginated inventory/maintenance process.

## Deployment and migration

1. Back up existing data. No destructive data migration or version bump was performed.
2. Deploy the updated backend with Admin Firestore/Storage/Auth permissions, HTTPS,
   correct Firebase credentials, database ID/bucket and storage-limit environment value.
   `POST /api/rams` paths accept bodies up to 12 MB for 8 MB PDF attachments; other API
   bodies retain their existing limits. Configure equivalent proxy limits/timeouts.
3. Deploy updated Firestore and Storage rules to the same project/database/bucket.
   Added private user subcollections: `rams`, `ramsFamilies`, `ramsReferences`,
   `ramsProjectLocks`, `storageReservations`. Issued records, retention markers, counters
   and permits are written only by the backend. Owners can read their own issued RAMS;
   other users cannot. Draft/template kinds are `ramsDraft` and `ramsTemplate` in business.
4. Coordinate the updated app and Storage-rules rollout: older Business clients without
   the upload-permit request cannot create new cloud files under the stricter rules.
   Deploy the backend first and test an updated client before switching public rules.
   Do not solve rollout failures by making Storage public or allowing forged permits.
5. Rebuild web/native assets and follow the normal Android/iOS release workflow. The
   localhost sandbox flag unlocks the UI only; cloud issue/upload still requires actual
   Business entitlement, a synced project and the deployed backend/rules.
6. Review the privacy notice/Termly documents for site assessments, named briefings,
   signatures and retention. The in-app summary, private account export, cache clearing
   and admin erasure script now include RAMS. Keep the existing privacy operations and
   backup lifecycle checklist; do not promise automatic erasure of historical documents.

New device cache: `sparkys-rams-v1`. Cache clearing refuses pending issues to avoid losing
their retry payloads. The existing absence of native app-level cache encryption still
applies; do not market this as a cryptographic signature vault or encrypted local archive.

## Verification and release checks

- `npm.cmd test` includes RAMS model, issue/retry, immutable history, concurrency,
  quota reservation, account partition, local persistence/CAS and retention tests.
- `npm.cmd run typecheck` validates the app. `npm.cmd run build:server` builds the server.
- `node --import ./scripts/register-test-loader.mjs scripts/check-rams-pdfs.mjs`
  creates synthetic PDFs in `build/rams-qa`; it uses the existing synthetic transparent
  logo fixture in `build/branding-qa/transparent-logo.png`.
- `scripts/verify-rams-pdfs.py` checks pagination, headers, page bounds, draft watermarks,
  transparency, no-logo fallback, briefing record and financial-field exclusions, and
  renders first/middle/final pages with pypdfium2. QA placeholders are not safety advice.
- Rule-source assertions are not emulator execution. Before production, run Firestore/
  Storage emulator tests with separate owner accounts, denied cross-account reads and
  writes, forged issued records/permits, expired/full quota and retained-project deletion.
- Test real Android/iOS document previews, export/share, upload permissions, offline
  drafts/restarts, account switching and a lost issue-response retry against a staging
  backend. No production project/rules or live subscription was modified here.

No AI-generated controls, electrical working procedures, third-party template library,
shared approval workflow, legal compliance certification or safety-approval claims are
included. The responsible business remains responsible for the content and controls.
