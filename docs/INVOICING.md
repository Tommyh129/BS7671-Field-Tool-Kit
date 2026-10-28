# Invoicing: Setup, Behaviour and Release Checks

## Scope and Navigation

Projects > All invoices is the account-wide list/dashboard. Each project also has
an Invoices section. Create an invoice there, or use Create invoice on a saved
quote/estimate. Conversion copies selling fields into an independent draft and
retains the source reference/revision. Existing drafts/ledgers trigger a duplicate
billing warning; an offline warning explains that other devices cannot be checked.
The original quote is not changed. No entitlements, prices, payments processing,
bank connections, tax filing or automatic customer email have been added.

Drafts use the existing owner-scoped IndexedDB/business sync system. Save draft is
durable before success is shown, including offline. A number is not assigned to a
draft. Issuing, payments, credits and reconciliation require a connected backend.

## Required Deployment Before Cloud Use

These changes have NOT been deployed by this task.

1. Complete PROJECTS-SETUP.md (Firestore, Storage and authenticated logo uploads).
   Deploy the updated firestore.rules and storage.rules to bs7671fieldtoolkit.
   The new business kind is invoiceDraft; existing data needs no migration.
2. Build and deploy the existing Express backend with `npm.cmd run build:full`.
   It now includes /api/invoices routes, verified Firebase bearer tokens and
   server-side PDF generation. Start the production service with `npm.cmd start`.
   The server bundle is build/server/server.cjs; dist contains public web assets
   only. Deploy both output directories or build them on the hosting service.
   PORT defaults to 3000 and honours the hosting environment. Do not deploy only
   the static web bundle: an old backend cannot issue financial records.
3. The backend service account needs Firebase token/revocation verification,
   Firestore transaction read/write access and read/create access to the configured
   Storage bucket. Use managed application credentials/ADC on the server, not
   credentials in the app, browser bundle, Git or exported records. Review least
   privilege IAM with the hosting administrator. No Admin credentials are created
   or embedded by this feature.
4. Native builds must use the correct existing VITE_API_BASE_URL deployment (see
   src/services/api.ts); browsers call their own backend origin. Rebuild the web
   bundle and run `npx.cmd cap copy android` / `npx.cmd cap copy ios`, then complete
   the native build/share checks. No new native plugin is required.
5. Local preview: close the existing preview server terminal/process yourself if
   it is running older routes, then run `npm.cmd run dev` from the normal repo.
   Start-Live-Preview.ps1 was updated to load TypeScript imports and watch invoice
   backend files. Windows blocked restarting the previously running process during
   this task; UI checks can still run but its old API needs a manual restart.

## Storage and Numbering

- Drafts: users/{uid}/business/{id}, kind invoiceDraft, linked to a project.
- Permanent financial aggregate: users/{uid}/invoices/{draftId}. The original
  financial contents, branding and customer/project snapshot are immutable. Only
  controlled server actions append payments, reversals, credits, sent dates/audit.
- Counters: users/{uid}/financeMeta/sequence, fields invoice and credit. Firestore
  transactions allocate separate INV-0001 and CN-0001 series per authenticated
  account. Client writes to counters/ledgers are denied; the API derives the UID
  from verified authentication and ignores any client-supplied owner.
- Permanent PDF/logo copies: invoices/{uid}/{invoiceId}/..., owner-readable and
  client-write/delete denied. The server uses create-only generation preconditions.
  Old issued PDFs are downloaded, never regenerated after profile/project edits.
- One business/numbering series per account is supported, not teams or multiple
  legal entities sharing an account. If importing an existing business/series,
  an administrator must initialise BOTH counters to the appropriate previous
  maxima before enabling issuing. Never reduce/reset/delete counters. Account or
  project migration must preserve financial IDs, counters and retained files.

Issuing first atomically reserves a number and freezes the validated contents,
then retains its PDF/logo, then marks it Issued with a timestamp. Failed uploads
leave Preparing, not a second invoice. Retry uses the same draft ID, frozen data
and number, including after a lost response/restart. Gaps are possible; reserved
numbers are never reused. Void is permitted only for an unissued reservation with
a reason. Issued corrections require full/partial credit notes, not silent edits.

Only one unresolved financial action is kept per device/account. Retry pending
action reconciles the same operation ID. Discard uncommitted action first checks
the server that it did not reserve/commit. A preparing invoice can instead be
voided with a reason. A pending credit reserves its original line amounts and must
be retried to finish storing its PDF; it cannot be edited into another credit.

## Money, VAT and Invoice Contents

GBP is the sole currency. Quantities support three decimal places; money supports
two. Quantities must be positive; rates/discounts non-negative. Each quantity/rate
extension is rounded half-up into integer pennies. A fixed pre-VAT discount is
allocated proportionally across lines with cumulative half-up penny allocation.
VAT is rounded half-up on each discounted line and summed, with a breakdown by
treatment. Credits use cumulative allocation of the original VAT so a full credit
exactly reverses its original net/VAT pennies. Negative invoice lines are blocked.

Supported treatments are standard 20%, reduced 5%, zero-rated, exempt,
outside-scope, and not VAT registered. Zero/exempt/outside-scope are separate
selections and PDF labels. Non-registered businesses cannot add VAT. A VAT invoice
requires a supplier VAT number. The app does not verify registration/eligibility.

Construction domestic reverse charge is explicitly UNSUPPORTED and blocked in
both client validation and server calculation. It must not be replaced with an
ordinary/zero VAT treatment to bypass the block. Mixed-CIS deductions, reverse
charge, self-billing, foreign-currency, EU/NI cross-border and tax-scheme-specific
templates need separate work and accountant review. This is not HMRC approved,
accounting-certified software or a tax-submission/MTD solution.

The full invoice contains supplier legal/trading name and address/contact,
customer billing address, separate site details where different, reference,
invoice and supply date (or service period end as the selected tax point), due
date, item quantities/unit prices/net/VAT, totals, terms, footer and opt-in payment
details. A draft is marked DRAFT. Supplier contacts are required at issue time.
Payments at issue are zero; later payments appear only in a separate balance
summary, not by modifying the original invoice. Tax-point selection may need
accountant advice, particularly for advance payments or continuous supplies.

Official guidance consulted on 18 October 2026:

- [GOV.UK: required invoice contents and sole trader/limited company details](https://www.gov.uk/invoicing-and-taking-payment-from-customers/invoices-what-they-must-include)
- [HMRC: full VAT invoice particulars](https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec5010)
- [VAT Notice 700: VAT invoices, rounding, credits and debts](https://www.gov.uk/guidance/vat-guide-notice-700)
- [HMRC: construction reverse-charge eligibility](https://www.gov.uk/guidance/how-to-use-the-vat-reverse-charge-if-you-supply-building-and-construction-services)
- [HMRC: reverse-charge invoice wording and VAT presentation](https://www.gov.uk/hmrc-internal-manuals/vat-reverse-charge-for-building-and-construction-services-manual/vatrevcon37100)

## Payments, Credits and Dashboard

Payments are manually recorded with date, amount, method, optional reference and
private note; there is no receipt verification. Overpayments are blocked against
the current outstanding amount in a transaction. Reversals retain the payment,
reason and audit entry. Credit notes have separate references, original invoice
links, dates/reasons and original line VAT. Concurrent/pending credits reserve
remaining creditable line amounts so they cannot exceed the original.

Status is derived: Issued, Partially paid, Paid, or Credited. Overdue is derived
from due date and a positive balance. A fully credited invoice is not labelled
Paid. Credits on a paid invoice show a customer credit balance; no refund is
implied or processed. A partial credit can leave Paid with a customer credit
balance where recorded payments exceed the adjusted liability.

Dashboard balances cover the chosen project scope across all issue dates. Date
filters apply to the displayed invoice list and the manual-payment period total.
Reversed payments are excluded from that total (current net records, not a bank
cash-flow statement). Cached data is explicitly labelled incomplete until server
refresh. Search covers customer, project, status and invoice reference.

## Export, Account Deletion and Retention

All invoices and each individual invoice offer a PRIVATE JSON export containing
records, original PDFs as data URLs, credit PDFs, payment/reversal history and
audit. Extract files by decoding the data URL in each files entry. The format is
versioned but is an export, not an automatic import/restore tool. Export runs must
download complete cloud records; a failure is not reported as a complete backup.
The bulk PDF payload limit is 100 MB; use individual invoice exports for larger
accounts. Keep exports private: they include customer and optional banking data.

Project deletion removes its unissued drafts and ordinary project content but
cannot erase the independent financial aggregate/PDF/logo. All invoices retains
access to issued records even after the project is removed; archive projects to
preserve the wider project context. Reserved/void numbers also remain retained.

Before account deletion, the app directs the user to export records and requires
an acknowledgement. Authentication deletion removes their future in-app access.
Financial records are not automatically cascade-deleted or purged on a fixed
timer. They remain under the old UID for the operator's reviewed legal retention
and data-deletion process. The operator must define/document that policy and
handle requests before public release; no indefinite retention or universal
retention period is promised. Local caches remain device data until app/site
storage is cleared. Never clear local storage with unsynced drafts/pending work.

## Verification and Remaining Release Work

Run `npm.cmd test`, `npm.cmd run typecheck`, the server invoice TypeScript check
and `npm.cmd run build:full`. New tests cover independent quote conversion,
rounding, mixed VAT, validation, reverse-charge blocking, concurrent numbers,
same-ID retries, file failure recovery, payments/reversals/overpayments, credit
limits/rounding, customer credit, reservation voiding, immutable PDFs and owner
path partitioning. Existing calculator/business tests remain in the suite.

Generate four synthetic PDF fixtures with:

```powershell
node --import ./scripts/register-test-loader.mjs scripts/check-invoice-pdfs.mjs
python scripts/verify-invoice-pdfs.py
```

The generator reuses build/branding-qa/transparent-logo.png from branding QA.
Fixtures include a six-page mixed-VAT invoice, non-VAT draft, credit and balance
summary. They contain no real customer or bank information. PDF text checks and
rendered page inspection cover logos, page counts, totals, treatment labels,
privacy and opt-in payment information. Browser checks exercise real local draft
saving and branded PDF preview, not a mock save or real customer transaction.

Before release: deploy the backend/rules; verify with two test accounts/devices
that cross-user reads/writes fail; run simultaneous live Firestore issue/retry and
credit/payment tests; check restarts/offline/reconnect; test native PDF sharing on
Android and iOS; and smoke-test authentication, subscription purchase/restore,
quotes and calculators. In-memory transaction tests are not deployed rules or
live multi-device tests. Obtain accountant review of the supported full invoice,
VAT rounding/discount allocation, credit-note template and chosen tax points.

### Local Verification Result (18 October 2026)

- 65 tests passed, including 19 invoice-specific cases and the existing store and
  electrical/business regression tests. Frontend and invoice-server TypeScript
  checks passed; production web/server bundles built successfully.
- The real compiled Express server was started temporarily on a separate local
  port. Health plus unauthenticated/invalid-token protection passed for list,
  original PDF/logo and all financial mutation routes. No financial record was
  created. This is not a valid-user cross-account Firebase rules test.
- Four PDF fixtures passed structural/text privacy checks. VAT invoice first,
  totals and last pages, credit note, non-VAT draft and balance summary were
  rendered and visually inspected. The long name and transparent logo fit.
- A clearly synthetic invoice draft was actually saved in the browser and
  remained after app reload; its real branded PDF rendered successfully. No mock
  saving, customer invoice issue or financial transaction was used for this QA.
- Windows denied stopping the old preview process, so its older API still needs
  the manual restart described above. Cloud issuing with real credentials,
  deployed rules, simultaneous devices and native sharing remain release gates.
- The server build uses a workspace-scoped esbuild resolver because native
  esbuild directory discovery hit protected Windows ancestor folders. Runtime
  package imports remain external; no customer data or credentials are bundled.
- Backend output/source maps are in build/server, outside the public dist folder
  and native web assets. Production start and the authentication check use that
  private server bundle.
- Invoice browser requests explicitly use the current origin even when the
  Capacitor web shim is present. Native invoice requests still use the configured
  backend. A regression test covers this without changing purchase/API routing
  elsewhere in the app.
