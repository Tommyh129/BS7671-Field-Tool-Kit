# Business subscription

Business is advertised at GBP 14.99/month with no free trial and includes all Pro
tools plus Projects, business profile/branding, quotes, materials and invoicing.
Pro remains GBP 5.99/month with its existing trial. Pro alone cannot unlock
Projects. Existing owner records/invoice PDFs remain exportable without Business.

## Required before selling

This code does NOT create, approve, price or publish store products or deploy
Firebase rules/server code. Do not release until the following are configured.

1. Apple App Store Connect: create auto-renewing subscription `business_subscription`
   for bundle `com.bs7671.fieldtoolkit`, monthly, UK price GBP 14.99. Complete
   metadata/availability/review. Put Business above Pro in the same subscription
   group, with Business at level 1 and Pro at level 2. The app verifies that both
   returned products have the same group ID and blocks purchases if they do not.
   Apple's upgrades start immediately; downgrades take effect at renewal. Do not add a Business trial unless
   you also change the offer/disclosure. Test with Sandbox/TestFlight.
2. Google Play Console: create `business_subscription`, activate one monthly
   auto-renewing base plan at GBP 14.99 in the UK and appropriate local prices.
   Do not configure a free-trial offer: this offer advertises immediate monthly
   billing. Test from a Play testing track with a licence tester. Both plan-change
   directions use the existing purchase token with Google's WITH_TIME_PRORATION
   replacement mode: the old subscription is replaced immediately, unused value
   changes the next billing date, and a second subscription is not created.
   Replacements select the paid base plan, not another introductory offer. Missing
   proof, multiple active plans or a store error blocks the change; there is no
   fallback to buying independently. Persistent native changes live in
   `scripts/patch-purchase-android-subscriptions.mjs`.
3. Optional alternate IDs must match on BOTH sides:
   frontend `VITE_IOS_BUSINESS_PRODUCT_ID` / `VITE_ANDROID_BUSINESS_PRODUCT_ID`
   (or `VITE_BUSINESS_PRODUCT_ID` fallback), backend `IOS_BUSINESS_PRODUCT_ID` /
   `ANDROID_BUSINESS_PRODUCT_ID`. Never reuse a Pro ID. Rebuild after VITE changes.
   Pro backend overrides are `IOS_PRO_PRODUCT_ID`, `ANDROID_PRO_PRODUCT_ID`,
   `PRO_PRODUCT_ID` and comma-separated `PRO_PRODUCT_ID_ALIASES`; these must also
   match the existing frontend Pro configuration.
4. Deploy the Express backend, Firestore rules AND Storage rules before the new
   app. Storage rules now look up the user's entitlement in the default Firestore
   database. Confirm cross-service rule permissions during deployment. The invoice
   mutation API now requires Business; reads and exports still require ownership
   but not a paid tier. Do not deploy rules to an older public app without a
   coordinated release/migration decision for existing Projects users.

## Server-only configuration

Never place these secrets in VITE variables, mobile assets, Git or screenshots.

- Firebase Admin application-default credentials, authorized for this project.
- Google Play: `PLAY_BILLING_VERIFICATION_ENABLED=true`, Google Play Developer API
  enabled, and the backend service account granted the necessary subscription
  access to this app in Play Console. GoogleAuth uses application-default
  credentials with the Android Publisher scope. `ANDROID_PACKAGE_NAME` defaults
  to `com.bs7671.fieldtoolkit`; confirm the release application ID matches.
- Apple: `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY` (the
  In-App Purchase API private key, PEM; escaped newlines supported).
  `IOS_BUNDLE_ID` defaults to `com.bs7671.fieldtoolkit`.
  Set `APPLE_IAP_ALLOW_SANDBOX=true` for TestFlight/Sandbox verification. Only a
  production transaction-not-found response triggers the Sandbox fallback.
- Web: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a trusted `APP_URL`.
  Create monthly GBP Price objects for Pro (599 pence) and Business (1499 pence),
  and set server-only `STRIPE_PRO_PRICE_ID` and `STRIPE_BUSINESS_PRICE_ID`.
  Price IDs must remain configured after a change so webhooks recognise the
  actual current price instead of relying on stale subscription metadata.
  Configure webhook events `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`, and
  `customer.subscription.deleted`. Web checkout requires a Firebase bearer token,
  derives the owner from it and sets GBP 14.99/month on the server (no trial).
  Existing subscribers, including legacy inline-price checkouts, are sent to a
  Stripe-hosted confirmation that updates the SAME subscription item. No new
  Checkout subscription is created. Portal configuration allows price changes,
  prorated upgrades and renewal-date downgrades; Stripe displays the amount before
  confirmation. An unresolved invoice or existing schedule blocks another change
  and needs management with the payment provider. New checkouts reuse a customer,
  expire unused open checkouts and use a server lock to prevent concurrent requests.
- Set the existing native API base URL to this deployed backend. Rebuild/copy the
  app assets after configuration; restarting only Android Studio is insufficient.

The readiness endpoint prevents starting Business payments when verification is
not enabled. Readiness indicates configuration presence, not valid credentials
or product approval. Verify both on a real store test track before release.

## Entitlements and restoration

Native Business proof is verified server-to-server with Google subscriptionsv2
or Apple's Get Transaction Info HTTPS API. The client cannot choose its expiry.
New Apple purchases attach a cryptographically random UUID as StoreKit
`appAccountToken`. Verification requires the matching value returned by StoreKit,
not just knowledge of a transaction ID. The existing plugin exposes this on both
purchase and restore. The persistent iOS patch now exposes subscription group IDs
and is run by postinstall as well as iOS preparation. Legacy Apple Pro purchases
without this UUID retain their existing restore path; changes stay in Apple.
Proof/receipt data is sent only to the configured backend, not diagnostic logs.
Server credentials never leave the server. Proof may be verified without an app
account; project storage requires signing in. On sign-in/restore the verified
purchase is bound transactionally to one Firebase UID, preventing reuse across
app accounts. Linking to another UID requires support/admin migration.
Verified native plans record provider/tier/expiry in the server-only
`nativeSubscription` field. Google linked old tokens are marked replaced and
cannot be used to restore the old entitlement. A signed-out change refreshes the
UID already bound to the proven purchase. Webhooks now track both tiers in
`stripeSubscriptionId`, `stripeCustomerId`, `stripeTier` and `stripeUntil`; they
re-read Stripe before updating access, including when a scheduled downgrade starts.

## Changing plans

Settings > Manage Subscription opens the same plan selector. Business subscribers
can select Pro; included Pro access no longer disables the downgrade. Existing
subscribers are not offered a new app-advertised free trial when switching.

Changes must use the original billing provider. The app checks signed-in account
billing records before launching native payments; web checkout refuses a known
native subscription. Unknown legacy Pro purchases must be restored on their
original store/device rather than starting a second payment elsewhere. There is
no automatic Apple-to-Google-to-Stripe transfer or cancellation. Signed-out users
can still buy/restore through their store, but unrelated purchases on other
providers/accounts cannot be detected without linking the same app account.
An old native expiry does not prove that auto-renewal ended. Known native billing
sources stay with their original store until support has reconciled them; the app
does not use an expired cached date as permission to charge a different provider.
Existing duplicate subscriptions are blocked from creating more; support must
reconcile them with their providers, not silently cancel/refund a customer's plan.

Business native access uses `businessUntil` (epoch milliseconds), Stripe uses
`businessStripeUntil`; either unexpired source unlocks Business and Pro. These
fields and the Stripe subscription ID are not client-writable. Console/Admin SDK
may set boolean `isBusiness: true` for an explicit manual grant, and remove/set it
false to withdraw that grant. Do not set this flag for ordinary paid renewals.
Subscription claims are Admin-only under `subscriptionClaims`.

Native purchases are refreshed on launch, app visibility and every five minutes
while foregrounded. Verified expiry is enforced by the UI, rules and invoice
server. An authenticated snapshot allows access offline until verified expiry;
new native purchases require online verification. Store verification failures
never grant Business and tell users to restore rather than pay again. Configure
store server notifications/reconciliation before requiring immediate refund/
revocation propagation across devices: the current refresh is client-driven and
without it an existing server grant lasts until its verified period end.

## Release checks

- New user, existing Pro user, Business user, signed-out user, expired Business.
- Upgrade and downgrade in both directions on each provider. Verify there is only
  one renewing subscription, correct credit/date, and no second trial. Apple/web
  Business access stays until a scheduled downgrade actually starts; Google
  replacement updates access to the new tier immediately.
- Cancel the confirmation, simulate a failed payment/restore and repeat on two
  devices. Confirm the old plan remains and no independent purchase is attempted.
- Test another store, unknown legacy ownership and existing duplicates: all must
  stop before a new charge and direct the user to the original billing provider.
- UK store confirmation is GBP 14.99 monthly; verify non-UK local prices/periods.
- Pending/cancelled payment does not unlock; completed payment restores after
  restart; Pro/unknown product IDs never grant Business.
- Test native restore without app registration, then link an account and confirm
  Projects sync and invoicing work. Check Android and iOS independently.
- Test Stripe successful checkout and cancellation/update webhooks; a cancellation
  at period end keeps access until that date. Confirm webhook retries succeed.
- Verify deployed Firestore/Storage rules reject forged Business profile fields
  and non-Business writes, but allow owner exports after expiry.
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build:full`, then
  `node scripts/check-invoice-api.mjs`. Native assets are copied with Capacitor
  after the web build. Store purchases and deployed rules need real environment
  tests; local tests alone do not certify them.

Sources: [Google subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions),
[Apple transaction lookup](https://developer.apple.com/documentation/appstoreserverapi/get-transaction-info).
