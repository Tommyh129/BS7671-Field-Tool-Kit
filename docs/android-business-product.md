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
   The production entry point loads Vite only in development, so pruning
   development dependencies does not prevent the server from starting.
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
`npm.cmd run test:server-runtime` also builds and starts the production server
with development-dependency imports blocked, without making a store purchase.

On 14 November 2026, both the `run.app` and `ai.studio` service URLs returned
only `{"ios":true,"android":true}`. GitHub main was commit `035a833` and also
lacked the product-capability response. This is an old server deployment,
not a reason to change the product again or remove the checkout safeguard.

If the check still reports `legacy_backend`, check the code source/commit,
whether the new server bundle was built, the container startup command and
whether traffic is routed to the new revision. Merely redeploying environment
variables does not upload the new local or GitHub source.

## Deploy the Source Archive Through Cloud Shell

For the existing service shown in your Cloud Run screenshots:

1. Open Google Cloud Console and choose **Default Gemini Project**
   (`gen-lang-client-0031083600`), not the separate Firebase project.
2. Open **Cloud Shell** using the terminal icon near the top of the console.
3. Upload the prepared `cloud-run-source-<commit>.zip` from this project's
   `build` folder using Cloud Shell's upload menu.
4. Extract that specific ZIP into a new folder and change into it.
5. Run the following from the extracted source folder:

```sh
gcloud run deploy the-sparkys-mate \
  --project=gen-lang-client-0031083600 \
  --region=europe-west1 \
  --source=. \
  --command=npm \
  --args=start \
  --update-env-vars=NODE_ENV=production
```

This builds new source rather than reusing the old image. The `gcp-build`
package script builds the web and server bundles. `--update-env-vars` changes
only `NODE_ENV`, rather than replacing the other configured environment
variables. Keep the existing service account and secret references.

6. After deployment succeeds, run `npm run check:billing-deployment`.
7. If the public endpoint still shows the old response, inspect Cloud Run
   **Revision history / Manage traffic** and route traffic to the verified new
   revision. Do not delete the previous revision; retain it for rollback.
8. Retry the installed Android app only after the readiness check passes.

Uploading a ZIP, pushing GitHub, or editing environment variables alone does
not execute this source deployment. A passing readiness check confirms the
server contract, not the Google Play service account's permissions or a
completed real purchase. Those require a controlled store/device test.

Do not recreate or rename the live product to repair this mismatch. Check the
exact Product ID in Play Console before changing configuration. Store account
eligibility and availability still require testing on the affected device.
