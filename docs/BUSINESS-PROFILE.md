# Business Profile and Client Documents

Open Projects, then the Business Profile gear button. A signed-in user can save
trading/legal names, address, contacts, website, company/VAT registrations,
payment terms, quote validity, footer, optional payment instructions and bank details.
Existing profiles receive additive defaults; issued records are not migrated.

## Logos and Privacy

- PNG/JPEG only, maximum input 5 MB and decoded image 40 megapixels. Images are
  resized proportionally to at most 1200 px; JPEG metadata is stripped and PNG
  transparency preserved. Preview, replace and remove are available.
- Logo files use owner-scoped Storage paths and authenticated downloads, not
  public URLs. New versions receive unique asset IDs so old issued PDFs remain
  unchanged. Complete the Firebase setup in PROJECTS-SETUP.md before cloud use.
- Payment instructions and bank details are OFF for each new document until
  explicitly enabled. Optional contact details can be disabled separately.
- Client materials lists exclude costs, suppliers, private notes and purchased
  status. Internal materials exports require a separate explicit selection and
  are labelled INTERNAL in the PDF and filename.
- Quotes expose selling rates and explicitly client-facing notes, not internal
  margins/costs. Calculation reports filter private/internal fields.

## Preview and Snapshots

Quotes, estimates, materials lists and calculation reports use a shared PDF layout
with proportional logo/text headers, project/customer context, reference, issue
date, revision where applicable, footer and page counts. A logo is never required.

PDF.js renders the actual generated PDF before export. Changing visibility
regenerates the preview and disables export until rendering completes. The same
Blob is exported using the existing native file/share sheet or browser download.
The PDF worker is bundled locally as a .js asset for native WebView MIME support;
no external viewer service receives documents.

New quotes/estimates copy the current business profile and validity defaults.
When marked Sent/Accepted, the saved company/visibility snapshot and original PDF
are retained. Profile edits do not regenerate issued PDFs. To change an issued
document, create a new revision. Materials and calculation exports use a snapshot
of the current profile at preview time. Existing calculator Share -> PDF actions
also open the branded preview; guest calculations remain possible without login.

## Verification and Device Checklist

Automated coverage includes profile defaults, validity dates, disclosure opt-ins,
logo type/size validation, issued branding immutability, and client/internal field
separation. Store tests cover owner isolation and original issued PDF retention.

Synthetic QA scripts (no real customer or banking information):

```powershell
node --import ./scripts/register-test-loader.mjs scripts/check-business-branding.mjs
# Requires Pillow and pypdf in your Python environment:
python scripts/verify-branding-pdfs.py
```

The generator expects the transparent-logo.png, wide-logo.jpg and portrait-logo.png
fixtures in build/branding-qa. The eight generated PDFs cover long names, PNG
transparency, JPEG, portrait aspect ratio, no logo, missing optional fields,
multiple pages, private-field exclusion and explicitly included payment details.
Generated PDFs were rendered and visually inspected on Windows. The live browser
also rendered an uploaded transparent logo and saved business profile in preview.

Before release, test on BOTH an Android device and iPhone/iPad:

1. Sign in, upload PNG/JPEG through Files/Photos, replace/remove it, and confirm
   the profile survives restart. Check another account cannot access its files.
2. Preview/share/open quote, estimate, materials and calculation PDFs, including
   long names, transparent/wide/portrait logos, no logo and multiple pages.
3. Confirm contacts toggle, bank/payment OFF by default, and explicit opt-in
   changes the actual exported PDF. Check internal materials are labelled and
   client exports contain no costs, margins, purchasing status or private notes.
4. Issue a quote, change the profile/logo, then reopen/share that issued quote:
   the original PDF must remain unchanged. New quotes must use the new defaults.
5. Test offline after downloading assets once, reconnect and verify cloud sync
   with deployed owner-only Firebase rules. Check native share cancellation.

Native device rendering/sharing and deployed Firebase access rules have NOT been
verified by the Windows/browser checks. This task does not publish a release,
deploy rules, or change version numbers.

### Local Verification Result (18 October 2026)

- 46 automated tests, TypeScript checks and the production web build passed.
- All eight PDF fixture checks passed. Browser checks confirmed profile/logo
  persistence, new-quote defaults, original issued branding, unsaved draft
  retention, disclosure controls and a 390 px layout with no horizontal overflow.
- The built web assets were copied into the existing Android and iOS projects;
  the bundled PDF worker hashes match the production build in both folders.
- Android debug assembly was attempted offline, but Windows denied access to
  the Gradle-cached appcompat-1.7.1-api.jar and problems-report.html. This is NOT a
  successful APK build. Close other build processes and retry in Android Studio.
- iOS archive/device checks require macOS/Xcode. Firebase rules/cloud access and
  native file sharing still require the device checklist above before release.
- The browser QA account contains a clearly synthetic QA business profile/logo;
  replace it with your own details. It is not seeded into the application.
