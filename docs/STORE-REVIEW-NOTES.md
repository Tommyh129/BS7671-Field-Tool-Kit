# Store Review Preparation

Prepared 28 October 2026 for version 1.1.2, local native build 27. This is a draft for the operator to verify before submission, not a store approval or legal opinion.

## Reviewer Explanation

- Consumer Pro and Business subscriptions are purchased with the platform store: `pro_subscription` and `business_subscription`.
- Business includes all Pro tools and Projects, quotes/estimates, invoices, materials, calculation records, business branding and RAMS.
- Purchase and restore are available without requiring registration. An optional app account enables account-linked access; an account is required to save/sync business records.
- Existing externally purchased entitlements can be accessed after sign-in. No new consumer web checkout or native invitation to buy an invoiced licence is offered.
- A separately agreed organisation licence assigns a bounded number of employee accounts with start/end dates. Provisioning is administrator-only; individual users cannot grant themselves paid access. Existing subscription records block invoice assignment until reviewed.
- Client invoices generated in Projects concern the electrician's client work; they are not an in-app payment system for buying app subscriptions.
- Existing Stripe management allows cancellation of verified existing subscriptions only; the portal configuration disables subscription updates. The live Stripe portal still needs verification.
- Supply a dedicated reviewer account with appropriate access through the store's private review fields. Never include real customer projects or signing/API credentials in public notes. No reviewer account has been created by this task.

## Policy Assessment And Remaining Decision

Apple's enterprise-services provision is conditional on direct sales to organisations/groups for employees or students and requires consumer/single-user sales to use IAP. The multiplatform-services provision also concerns access to features bought elsewhere when those features are available through IAP. This hybrid consumer/organisation model should be described explicitly to App Review; an invoice alone does not establish eligibility.

Google requires Play Billing for in-app purchases of digital features/business software and restricts steering to alternative payment methods. Its consumption-only guidance does not automatically exempt this app because it also offers in-app subscriptions. Confirm the proposed organisation-licensing arrangement with Play support/review before provisioning paying organisations. Do not represent this check as an approved exemption.

Official sources checked on 28 October 2026:

- https://developer.apple.com/app-store/review/guidelines/ (3.1.1, 3.1.3(b), 3.1.3(c))
- https://support.google.com/googleplay/android-developer/answer/9858738?hl=en
- https://support.google.com/googleplay/android-developer/answer/10281818?hl=en-GB

## Operator Checks Before Testing

1. Apple Business-above-Pro ordering was completed, confirmed by the operator on 28 October 2026. Verify actual replacements in TestFlight; the earlier ordering blocker is closed.
2. Set Cloud Run Apple IAP verification credentials (`APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY`) and enable the intended TestFlight sandbox handling only where required. These are not the frontend Firebase config or automatically the Codemagic upload credentials.
3. Give the Cloud Run service account the appropriate Play subscription verification permissions before setting `PLAY_BILLING_VERIFICATION_ENABLED=true`.
4. Confirm deployed product IDs, app ID `com.bs7671.fieldtoolkit`, secrets, runtime permissions and legal URLs. The checked-in code defaults do not prove deployment configuration.
5. Deploy the backend and latest Firestore/Storage rules together. Permanent Pro grants now require the backend/Admin SDK. Legacy local native Pro remains local when server verification is unavailable; cross-device sync needs verification. Existing historical permanent flags have not been migrated or audited.
6. Keep legacy Stripe webhooks available until old subscribers/checkouts are reconciled. No subscriptions or signing certificates have been cancelled/revoked by this task.
7. Check actual store version/build ceilings. Local version is 1.1.2 / 27; Codemagic computes its archive build as repository base 27 plus its numeric build counter. This cannot independently prove it exceeds every uploaded store build.
8. Run real signed-device tests for new/returning/guest purchases, trial eligibility, restore, upgrade/downgrade, expiry, cancellation, refunds and account changes. Confirm the original renewing plan is replaced, not duplicated.

## CI Signing

Codemagic no longer revokes all distribution certificates before signing. It still creates a certificate/profile in its existing workflow; if account certificate limits are reached, configure reusable signing assets rather than revoking other apps' certificates. Mac signing/archive validation must be performed in Codemagic; no Apple build or upload was run on Windows.
