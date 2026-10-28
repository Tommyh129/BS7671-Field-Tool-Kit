# Release Checklist

Updated: 2026-10-28. Keep this checklist updated as the user confirms actions.
Checked items mean completed as described, not approval of legal compliance.
Local code is the source of truth. No push or release is authorised by this checklist.

## Confirmed Preparation

- [x] Termly: Privacy Policy published, dated 25 October 2026; public heading verified.
- [x] Termly: Terms and Conditions published, dated 25 October 2026; public heading verified.
- [x] Termly: Data-processing documentation completed, confirmed by user on 28 October 2026. User confirms the relevant links were provided previously. Documentation completion is not an independent compliance assessment; see the separate app-link verification below.
- [x] Codex: Published policy/terms links added as app defaults; notice version updated. Build-time URL overrides still take precedence.
- [x] Firestore: Rules deployed to bs7671fieldtoolkit / (default), as confirmed by user; live enforcement not independently tested.
- [x] Storage: Rules deployed, as confirmed by user; live enforcement not independently tested.
- [x] Cloud Run: Existing service identified as the-sparkys-mate, europe-west1, deployed from AI Studio.
- [x] AI Studio: GitHub connection confirmed to Tommyh129/BS7671-Field-Tool-Kit, branch main. Sync currency not yet confirmed.
- [x] Google Play: Business subscription added in Play Console, confirmed by user. Price, activation, product ID and replacement behaviour not yet independently verified.
- [x] App Store Connect: Business subscription added, confirmed by user. Price, product ID, subscription group/levels, review status and replacement behaviour not yet independently verified.
- [x] Google Play and Apple: Business price is GBP 14.99/month, confirmed by user; local app display and price validation updated to match.
- [x] Apple: Subscription ordering corrected, confirmed by user on 28 October 2026. Earlier screenshots showing the old ordering are superseded; final level numbers have not been independently inspected. Real upgrade/downgrade testing remains outstanding.
- [x] Sales model confirmed: individuals purchase through Apple/Google Play only. Bulk business access is arranged directly by invoice; no new public Stripe checkout is required. Administrator provisioning is implemented locally, but live provisioning and store-policy eligibility remain unverified.

## Previously Deferred

- [x] Apple subscription ordering: previously deferred on 27 October; now completed as confirmed by user on 28 October 2026. No longer an ordering blocker.

## Current Local Implementation

- [x] New website checkout blocked in the app and backend; existing Stripe webhook/restore paths retained.
- [x] Authenticated legacy Stripe management added with cancellation enabled and plan changes disabled. Live portal configuration still needs verification.
- [x] Native/public fallback URL corrected to the existing Cloud Run service. No local API URL override found; deployment/build environment overrides must still be checked.
- [x] Administrator-only invoiced Business licence tool added: dry run, seat capacity, account checks, dated grants, renewal and revocation. No production grants applied.
- [x] Existing provider/manual-access records block invoice assignment; current or scheduled invoiced access blocks a separate personal store purchase.
- [x] Grant expiry integrated into app/server entitlement checks and protected Firestore/Storage rules; account erasure removes seat membership.
- [ ] Deploy these new rules and backend, test administrator assignment/revocation with test accounts and verify rules using the Firebase emulator/live test accounts.
- [ ] Review existing Stripe subscriptions and pending sessions in Stripe. Reconcile any active checkouts and cancel/expire them as appropriate; code changes cannot cancel an already-created checkout link.
- [ ] Confirm organisation-sales eligibility and review notes before public release. No promise of store-policy compliance is implied.
- [x] Fixed retained RAMS PDF Buffer/Blob typing; frontend and complete server typechecks now pass.
- [x] Local verification: 127 tests, production web build and production server bundle passed on 28 October 2026. Native purchase patches also passed twice against a fresh published plugin fixture.
- [x] Version aligned to 1.1.2 in package/Android/iOS; Android versionCode and local iOS build are 27. Confirm these exceed actual store ceilings before upload. Codemagic uses repository base plus its build counter.
- [x] Final web assets synced with Capacitor into the existing Android and iOS folders. All 17 web files match dist by SHA-256; no preview-server URL, billing diagnostic panel or QA sample customer is bundled. Native billing registration is present on both platforms.
- [x] Release builds reject sandbox/diagnostic flags, unsafe URL overrides and mismatched confirmed product IDs. Web/Android/iOS Firebase project IDs match bs7671fieldtoolkit.
- [x] Removed client/test-email permanent Pro self-grants. Backend/Admin SDK owns account entitlement writes; development-only preview access remains. Old historical grants have not been audited or migrated.
- [x] Codemagic no longer revokes all account distribution certificates. Generated Swift package paths are normalised for macOS; real signing/archive validation still requires Codemagic.
- [x] Current official store payment policies reviewed; draft reviewer explanation and external configuration checks saved in docs/STORE-REVIEW-NOTES.md. This is not store approval of organisation licensing.
- [ ] Visual verification of the updated checkout: preview browser could not connect to localhost during this check. No real store purchase, Stripe portal session or administrator grant has been exercised.

## Remaining Actions In Order

1. [x] Codex: Complete local release checks and fix the RAMS server error. Tests, web/server typechecks and builds pass. Public-release guards and entitlement-write protection added; external runtime credentials, store approval and signed-device behaviour still need checks below.
2. [x] Termly: Privacy/terms and data-processing documentation completed, as confirmed by user. Published privacy/terms links are app defaults; verify the separate data-processing link integration below without treating the documentation itself as unfinished.
3. [x] Apple: Business/Pro subscription ordering completed, confirmed by user. Actual replacements, subscription review status and organisation-sales eligibility still require the external testing/review steps below.
4. [x] Codex: Bump to 1.1.2 / local build 27, build web/server and sync/verify Android and iOS assets in the existing project folders. No signed AAB/IPA has been built locally.
5. [x] GitHub: Release source committed and pushed to Tommyh129/BS7671-Field-Tool-Kit, main, on 28 October 2026. Release source commit: ce6534c (Prepare 1.1.2 Business release, calculations and privacy safeguards). Android's ignored generated release assets were explicitly included; credentials/private licence manifests were excluded. This does not confirm a Cloud Run deployment or store upload.
6. [ ] AI Studio: Pull that same GitHub commit and confirm it is current; do not redeploy an older AI Studio copy over these changes.
7. [ ] Cloud Run: Configure/verify Apple IAP credentials, Play verification permissions/flag, Firebase access, legacy Stripe settings and production URLs, then deploy the updated backend. Verify health and subscription-readiness endpoints. See docs/STORE-REVIEW-NOTES.md.
8. [ ] Firebase: Deploy the latest Firestore and Storage rules together with the backend. Rules changed again for server-only Pro grants and invoiced Business access. Test account isolation, profile creation, project sync/uploads, licence expiry/revocation and denial of self-granted access; earlier rule deployments do not cover this release.
9. [ ] Stripe: Review existing subscribers and pending checkout links; preserve cancellation, restore and webhooks until reconciled. New checkout is disabled in local code only until deployed. No subscriptions/checkout links have been cancelled by Codex.
10. [ ] Android Studio / Google Play: Open the existing android folder, sync Gradle, confirm version 1.1.2/code 27 exceeds uploaded versions, build a signed release AAB and upload to Internal testing. Verify exact IDs, an active monthly base plan and eligible offers.
11. [ ] Codemagic / App Store Connect: Build iOS from the same commit using correct reusable signing assets and backend configuration. Confirm its archive build exceeds uploaded builds, then upload to TestFlight only.
12. [ ] Signed Android / TestFlight: Test login, guest/account purchases, trial eligibility, Pro/Business, restore, upgrade/downgrade replacing one renewing subscription, cancellation/expiry, invoiced accounts, sync, calculations, documents and legal links. Complete visual checks. Fix failures before review; bump build numbers again where required.
13. [ ] Store listings: Update App Privacy / Data safety, legal URLs, screenshots and release notes; provide private reviewer test access and describe the subscription/organisation model using the draft notes. Confirm organisation-sales eligibility before provisioning paying organisations. Verify which supplied published document contains the data-processing terms and connect its dedicated app link if applicable; do not request new documentation merely because the URL integration is unverified.
14. [ ] Public release: Submit tested builds for review only after the blockers above are resolved. After approvals, release with staged/manual controls and monitor purchases, entitlements, syncing and server errors.

## Published Documents

- Privacy Policy: https://app.termly.io/policy-viewer/policy.html?policyUUID=6b10edd9-015b-429b-88bc-e8e2c415ed7d
- Terms and Conditions: https://app.termly.io/policy-viewer/policy.html?policyUUID=91dde6aa-55a2-4e06-bd83-2ae1c31dd091
- Data-processing documentation: completed and links previously supplied, confirmed by user. The locally verified URLs above are currently labelled Privacy Policy and Terms and Conditions. VITE_DATA_PROCESSING_TERMS_URL is blank in the example and no dedicated published default is present in source; mapping the completed data-processing document to its app entry remains an integration check, not an unfinished Termly task.

## Deployment

- Existing service URL: https://the-sparkys-mate-29962838005.europe-west1.run.app
- Release source ce6534c pushed to GitHub main on 28 October 2026. Cloud Run deployment, AI Studio sync and native store uploads have not been verified or performed as part of this push task.
