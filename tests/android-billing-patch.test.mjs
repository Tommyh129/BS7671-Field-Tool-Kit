import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const java = 'android/src/main/java/com/scgscorp/capacitorpluginpurchase/';
test('persistent Android billing patch is idempotent and preserves checkout guards', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'sparky-billing-'));
  const files = ['android/build.gradle', `${java}InAppPurchase.kt`, `${java}InAppPurchasePlugin.kt`];
  const target = path.join(fixture, 'node_modules/capacitor-plugin-purchase');
  try {
    for (const file of files) {
      mkdirSync(path.dirname(path.join(target, file)), {recursive:true});
      copyFileSync(path.join(root, 'node_modules/capacitor-plugin-purchase', file), path.join(target, file));
    }
    const patch = () => execFileSync(process.execPath, [path.join(root, 'scripts/patch-purchase-android-subscriptions.mjs')], {cwd:fixture});
    patch();
    const first = files.map(file => readFileSync(path.join(target, file), 'utf8'));
    patch();
    assert.deepEqual(files.map(file => readFileSync(path.join(target, file), 'utf8')), first);
    const native = first[1], bridge = first[2];
    assert.equal(native.split('fun getBillingDiagnostics():').length - 1, 1);
    assert.equal(native.split('fun recordDiagnosticFailure(').length - 1, 1);
    const readQuery = native.split('fun getProductsWithRecovery(')[1].split('// Fetch product details')[0];
    assert.match(readQuery, /attempt < 2/);
    assert.match(readQuery, /20000L/);
    assert.match(readQuery, /handler.removeCallbacksAndMessages\(null\)/);
    for (const reason of ['NO_ELIGIBLE_OFFER', 'PRODUCT_NOT_FOUND', 'INVALID_PRODUCT_ID_FORMAT']) assert.ok(readQuery.includes(`UnfetchedProduct.StatusCode.${reason}`));
    assert.doesNotMatch(readQuery, /launchBillingFlow|purchaseProduct\(|startConnection\(/);
    assert.match(bridge, /billing.getProductsWithRecovery/);
    assert.match(bridge, /call.reject\(error[^\n]+PRODUCT_QUERY_FAILED/);
    assert.match(bridge, /phase.billingPeriod == "P1M"/);
    assert.match(bridge, /if \(call.getBoolean\("preferBasePlan", false\) == true\) \{\s*subscriptionOffers.firstOrNull \{ it.offerId == null \}/);
    assert.match(native, /setOldPurchaseToken\(oldPurchaseToken\)/);
    assert.match(native, /WITH_TIME_PRORATION/);
    assert.match(native, /subscription_payment_pending/);
  } finally {
    rmSync(fixture, {recursive:true, force:true});
  }
});
