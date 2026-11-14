# Android Business Product ID

The supplied Google Play Console screenshot shows `business_subsciption`
(without the `r` in subscription). The app previously queried only
`business_subscription`. These are different, immutable store identifiers.

The shared `businessStoreProductIds` helper now recognises both Android IDs
for product lookup, restores, plan replacement and server verification.
Apple continues to use `business_subscription`. Product IDs are not base-plan
or offer IDs; do not substitute `business-subsciption` or `1-monthfreetrial`.

## Deployment Order

1. Deploy the updated server to Cloud Run first. An older server rejects the
   actual Android product even if Google Play successfully completes payment.
   Commit and push the local source first if deploying from GitHub. Google
   source builds use `gcp-build` to compile both web assets and the server.
   Start this source with `npm start` (`node build/server/server.cjs`), not an
   older generated `server.js` left in an AI Studio deployment.
2. Set `ANDROID_BUSINESS_PRODUCT_ID` and `VITE_ANDROID_BUSINESS_PRODUCT_ID` to
   `business_subsciption`. The alias support also tolerates the old values.
3. Build the updated web assets, sync Android and upload a newly versioned,
   signed Android bundle to a Play testing track.
4. Install from that track. Test an existing Pro account upgrading, a new
   eligible subscriber, a trial-ineligible account, cancellation and restore.
5. Confirm Play shows replacement of the existing plan and that the verified
   Business entitlement unlocks Projects. Do not retry payment after a
   verification failure; use Restore Purchases.

## Check the Live Backend Before Another App Release

Run `npm.cmd run check:billing-deployment` in PowerShell from the project folder.
It must report `"ok": true`, `"status": "ready"`, and include
`business_subsciption` in `products` for Android. This checks the deployment
contract, not actual Google API permissions or payment completion.

On 14 November 2026, both the `run.app` and `ai.studio` service URLs returned
only `{"ios":true,"android":true}`. GitHub main was commit `035a833` and also
lacked the product-capability response. This is an old server deployment,
not a reason to change the product again or remove the checkout safeguard.

If the check still reports `legacy_backend`, check the code source/commit,
whether the new server bundle was built, the container startup command and
whether traffic is routed to the new revision. Merely redeploying environment
variables does not upload the new local or GitHub source.

Do not recreate or rename the live product to repair this mismatch. Check the
exact Product ID in Play Console before changing configuration. Store account
eligibility and availability still require testing on the affected device.
