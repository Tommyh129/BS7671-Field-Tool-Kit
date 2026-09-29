import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageRoot = path.join(root, 'node_modules', 'capacitor-plugin-purchase');
const buildGradlePath = path.join(packageRoot, 'android', 'build.gradle');
const implementationPath = path.join(packageRoot, 'android', 'src', 'main', 'java', 'com', 'scgscorp', 'capacitorpluginpurchase', 'InAppPurchase.kt');
const pluginPath = path.join(packageRoot, 'android', 'src', 'main', 'java', 'com', 'scgscorp', 'capacitorpluginpurchase', 'InAppPurchasePlugin.kt');

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${path.relative(root, filePath)}`);
  }
}

const evolvedPatchMarkers = {
  'Android billing diagnostic helpers': 'private fun sanitizeDiagnosticText',
  'Android purchase update diagnostics': 'purchase_update_failed',
  'Android billing setup diagnostics': 'billing_setup_failed',
  'Android billing setup failure snapshot': 'private data class PendingBillingOperation',
  'Android billing disconnect diagnostics': 'billing_service_disconnected',
  'Android billing disconnect failure snapshot': 'private data class PendingBillingOperation',
  'Android can make purchases diagnostics': 'billing_client_not_initialized',
  'Android can make purchases failure snapshot': 'private data class PendingBillingOperation',
  'Android returned product and eligible offer diagnostics': 'diagnosticReturnedProductIds = this.productDetailsList.map',
  'Android eligible subscription offer diagnostics': 'diagnosticSelectedBasePlanId = selectedOffer?.basePlanId',
  'Android eligible offer selection snapshot': 'lastBillingStage = "selectOffer"',
  'Android missing eligible subscription offer guard': 'REQUESTED_SUBSCRIPTION_OFFER_UNAVAILABLE',
  'Android launch billing flow diagnostics': 'launch_billing_flow_failed',
  'Android plugin subscription price mapping': 'val subscriptionOffers = productDetails.subscriptionOfferDetails.orEmpty()',
  'Android plugin purchase request diagnostics': 'offerTokenProvided=',
  'Android plugin missing activity diagnostics': 'billing.recordDiagnosticFailure(',
  'Android plugin product type read': 'val billing = requireBilling(call, "getProducts")',
  'Android plugin product type pass-through': 'billing.getProducts(productIds, productType)',
  'Android billing diagnostics bridge method': 'failedCheck", "billing_initialization_failed"',
  'Android plugin activity failure snapshot': 'billing.recordDiagnosticFailure(',
  'Android plugin selected offer token pass-through': 'billing.purchaseProduct(currentActivity, productId, userId, productType, offerToken)'
};

function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) {
    return content;
  }
  const evolvedMarker = evolvedPatchMarkers[label];
  if (evolvedMarker && content.includes(evolvedMarker)) {
    return content;
  }
  if (!content.includes(search)) {
    throw new Error(`Could not patch ${label}. Expected source fragment was not found.`);
  }
  return content.replace(search, replacement);
}

function replaceRequiredAny(content, searchFragments, replacement, label) {
  if (content.includes(replacement)) {
    return content;
  }
  for (const search of searchFragments) {
    if (content.includes(search)) {
      return content.replace(search, replacement);
    }
  }
  throw new Error(`Could not patch ${label}. Expected source fragment was not found.`);
}

function replaceBillingVersion(content, version) {
  const billingVersionPattern = /billingVersion\s*=\s*['"][^'"]+['"]/;
  if (!billingVersionPattern.test(content)) {
    throw new Error('Could not patch Android Play Billing version. billingVersion was not found.');
  }
  return content.replace(billingVersionPattern, `billingVersion = '${version}'`);
}

function replaceBetween(content, start, end, replacement, label) {
  if (content.includes(replacement)) {
    return content;
  }
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`Could not patch ${label}. Expected source block was not found.`);
  }
  return content.slice(0, startIndex) + replacement + content.slice(endIndex);
}

function writeIfChanged(filePath, content) {
  const current = fs.readFileSync(filePath, 'utf8');
  if (current !== content) {
    fs.writeFileSync(filePath, content);
  }
}

requireFile(buildGradlePath);
requireFile(implementationPath);
requireFile(pluginPath);

let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
buildGradle = replaceBillingVersion(buildGradle, '9.0.0');
buildGradle = buildGradle.replaceAll(
  "getDefaultProguardFile('proguard-android.txt')",
  "getDefaultProguardFile('proguard-android-optimize.txt')"
);
buildGradle = replaceRequired(
  buildGradle,
  `apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'
`,
  `apply plugin: 'com.android.library'
if (extensions.findByName('kotlin') == null) {
    apply plugin: 'kotlin-android'
}
`,
  'Android purchase Kotlin plugin duplicate guard'
);
writeIfChanged(buildGradlePath, buildGradle);

let implementation = fs.readFileSync(implementationPath, 'utf8');

implementation = replaceRequired(
  implementation,
  '// Updated for Google Play Billing Library 7.1.1\n',
  '// Updated for Google Play Billing Library 9.0.0\n',
  'Android Play Billing Library comment'
);

implementation = replaceRequired(
  implementation,
  `            .enablePendingPurchases() // Required for pending transactions
`,
  `            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build()
            )
            .enableAutoServiceReconnection()
`,
  'Android Billing 9 pending purchase setup'
);

if (!implementation.includes('private fun billingProductTypeFor(productType: String?)')) {
  implementation = replaceRequired(
    implementation,
    '    private var isBillingConnected = false\n',
    `    private var isBillingConnected = false

    private fun billingProductTypeFor(productType: String?): String {
        return when (productType?.lowercase(Locale.ROOT)) {
            "subscription", "subs" -> BillingClient.ProductType.SUBS
            else -> BillingClient.ProductType.INAPP
        }
    }
`,
    'Android purchase product type helper'
  );
}

implementation = replaceRequired(
  implementation,
  `    private fun billingProductTypeFor(productType: String?): String {
`,
  `    private var lastBillingResponseCode: Int? = null
    private var lastBillingDebugMessage: String? = null

    private fun logBillingResult(stage: String, billingResult: BillingResult) {
        lastBillingResponseCode = billingResult.responseCode
        lastBillingDebugMessage = billingResult.debugMessage
        Log.d(TAG, "[BillingDiagnostics] stage=$stage responseCode=\${billingResult.responseCode} debugMessage=\\\"\${billingResult.debugMessage}\\\"")
    }

    private fun logBillingReadiness(stage: String) {
        val initialized = ::billingClient.isInitialized
        val ready = initialized && billingClient.isReady
        Log.d(
            TAG,
            "[BillingDiagnostics] stage=$stage initialized=$initialized ready=$ready connected=$isBillingConnected " +
                "lastResponseCode=\${lastBillingResponseCode ?: "none"} lastDebugMessage=\\\"\${lastBillingDebugMessage ?: "none"}\\\""
        )
    }

    private fun billingProductTypeFor(productType: String?): String {
`,
  'Android billing diagnostic helpers'
);

implementation = replaceRequired(
  implementation,
  `        Log.d(TAG, "onPurchasesUpdated: Response Code: \${billingResult.responseCode}, Purchases: \${purchases?.size ?: 0}")
`,
  `        logBillingResult("onPurchasesUpdated", billingResult)
        Log.d(TAG, "[BillingDiagnostics] stage=onPurchasesUpdated purchaseCount=\${purchases?.size ?: 0}")
`,
  'Android purchase update diagnostics'
);

implementation = replaceRequired(
  implementation,
  `            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
`,
  `            override fun onBillingSetupFinished(billingResult: BillingResult) {
                logBillingResult("onBillingSetupFinished", billingResult)
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
`,
  'Android billing setup diagnostics'
);

implementation = replaceRequired(
  implementation,
  `            override fun onBillingServiceDisconnected() {
                isBillingConnected = false
                Log.w(TAG, "Billing Service Disconnected. Will attempt to reconnect on next operation or explicit retry.")
`,
  `            override fun onBillingServiceDisconnected() {
                isBillingConnected = false
                logBillingReadiness("onBillingServiceDisconnected")
                Log.w(TAG, "Billing Service Disconnected. No BillingResult is supplied for this callback.")
`,
  'Android billing disconnect diagnostics'
);

implementation = replaceRequired(
  implementation,
  `    fun canMakePurchases(): Boolean {
        // Check both initialization and connection status
        return ::billingClient.isInitialized && billingClient.isReady && isBillingConnected
    }
`,
  `    fun canMakePurchases(): Boolean {
        // Check both initialization and connection status
        val allowed = ::billingClient.isInitialized && billingClient.isReady && isBillingConnected
        logBillingReadiness("canMakePurchases allowed=$allowed")
        return allowed
    }
`,
  'Android can make purchases diagnostics'
);

implementation = replaceRequired(
  implementation,
  '    fun getProducts(productIds: List<String>, callback: (List<ProductDetails>) -> Unit) {\n',
  '    fun getProducts(productIds: List<String>, productType: String? = null, callback: (List<ProductDetails>) -> Unit) {\n',
  'Android getProducts signature'
);

implementation = replaceRequired(
  implementation,
  `                val productList = productIds.map { productId ->
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        // Specify type for clarity, INAPP for consumables/non-renewing
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
                }
                // Add SUBS type if you support subscriptions
                // val productListSubs = subscriptionIds.map { productId -> ... .setProductType(BillingClient.ProductType.SUBS) ... }

                val params = QueryProductDetailsParams.newBuilder()
                    .setProductList(productList /* + productListSubs */) // Combine lists if needed
`,
  `                val billingProductType = billingProductTypeFor(productType)
                val productList = productIds.map { productId ->
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(billingProductType)
                        .build()
                }

                val params = QueryProductDetailsParams.newBuilder()
                    .setProductList(productList)
`,
  'Android product query type'
);

implementation = replaceRequired(
  implementation,
  `                Log.d(TAG, "Querying product details for IDs: $productIds")
`,
  `                Log.d(TAG, "Querying product details for IDs: $productIds type: $billingProductType")
`,
  'Android product query log'
);

if (!implementation.includes('[BillingDiagnostics] stage=queryProductDetailsAsync')) {
  implementation = replaceRequiredAny(
    implementation,
    [
    `                billingClient.queryProductDetailsAsync(params) { billingResult, fetchedProductDetailsList ->
                    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && fetchedProductDetailsList != null) {
                        Log.i(TAG, "Successfully fetched \${fetchedProductDetailsList.size} product details.")
                        // Filter results by type if you queried multiple types
                        this.productDetailsList = fetchedProductDetailsList
                            .filter { it.productType == BillingClient.ProductType.INAPP } // Keep only INAPP for this example
                            .toMutableList()
                        // Store SUBS details separately if needed
                        callback(this.productDetailsList) // Return only the relevant (INAPP) products
                    } else {
                        Log.e(TAG, "Failed to query product details: \${billingResult.debugMessage} (Code: \${billingResult.responseCode})")
                        this.productDetailsList.clear() // Clear cache on failure
                        callback(emptyList())
                    }
                }
`,
    `                billingClient.queryProductDetailsAsync(params) { billingResult, fetchedProductDetailsList ->
                    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && fetchedProductDetailsList != null) {
                        Log.i(TAG, "Successfully fetched \${fetchedProductDetailsList.size} product details.")
                        // Filter results by type if you queried multiple types
                        this.productDetailsList = fetchedProductDetailsList
                            .filter { it.productType == billingProductType }
                            .toMutableList()
                        callback(this.productDetailsList)
                    } else {
                        Log.e(TAG, "Failed to query product details: \${billingResult.debugMessage} (Code: \${billingResult.responseCode})")
                        this.productDetailsList.clear() // Clear cache on failure
                        callback(emptyList())
                    }
                }
`
    ],
    `                billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
                    val fetchedProductDetailsList = queryProductDetailsResult.productDetailsList
                    val unfetchedProducts = queryProductDetailsResult.unfetchedProductList

                    if (unfetchedProducts.isNotEmpty()) {
                        Log.w(TAG, "Billing did not return \${unfetchedProducts.size} product details for IDs: $productIds")
                    }

                    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                        Log.i(TAG, "Successfully fetched \${fetchedProductDetailsList.size} product details.")
                        this.productDetailsList = fetchedProductDetailsList
                            .filter { it.productType == billingProductType }
                            .toMutableList()
                        callback(this.productDetailsList)
                    } else {
                        Log.e(TAG, "Failed to query product details: \${billingResult.debugMessage} (Code: \${billingResult.responseCode})")
                        this.productDetailsList.clear()
                        callback(emptyList())
                    }
                }
`,
    'Android Billing 9 product details callback'
  );

  implementation = replaceRequired(
    implementation,
    `                        this.productDetailsList = fetchedProductDetailsList
                            .filter { it.productType == BillingClient.ProductType.INAPP } // Keep only INAPP for this example
                            .toMutableList()
                        // Store SUBS details separately if needed
                        callback(this.productDetailsList) // Return only the relevant (INAPP) products
`,
    `                        this.productDetailsList = fetchedProductDetailsList
                            .filter { it.productType == billingProductType }
                            .toMutableList()
                        callback(this.productDetailsList)
`,
    'Android product details filter'
  );
}

implementation = replaceRequired(
  implementation,
  `                billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
                    val fetchedProductDetailsList = queryProductDetailsResult.productDetailsList
`,
  `                billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
                    logBillingResult("queryProductDetailsAsync", billingResult)
                    val fetchedProductDetailsList = queryProductDetailsResult.productDetailsList
`,
  'Android product query BillingResult diagnostics'
);

implementation = replaceRequired(
  implementation,
  `                        this.productDetailsList = fetchedProductDetailsList
                            .filter { it.productType == billingProductType }
                            .toMutableList()
                        callback(this.productDetailsList)
`,
  `                        this.productDetailsList = fetchedProductDetailsList
                            .filter { it.productType == billingProductType }
                            .toMutableList()
                        Log.i(
                            TAG,
                            "[BillingDiagnostics] stage=queryProductDetailsAsync productDetailsReturned=\${this.productDetailsList.isNotEmpty()} " +
                                "fetchedCount=\${fetchedProductDetailsList.size} matchingTypeCount=\${this.productDetailsList.size} " +
                                "requestedIds=$productIds returnedIds=\${this.productDetailsList.map { it.productId }}"
                        )
                        this.productDetailsList.forEach { details ->
                            val eligibleOffers = details.subscriptionOfferDetails.orEmpty()
                            Log.i(
                                TAG,
                                "[BillingDiagnostics] productId=\${details.productId} productType=\${details.productType} " +
                                    "eligibleOfferReturned=\${eligibleOffers.isNotEmpty()} eligibleOfferCount=\${eligibleOffers.size}"
                            )
                            eligibleOffers.forEachIndexed { index, offer ->
                                Log.d(
                                    TAG,
                                    "[BillingDiagnostics] productId=\${details.productId} offerIndex=$index " +
                                        "basePlanId=\${offer.basePlanId} offerId=\${offer.offerId ?: "base-plan"} " +
                                        "pricingPhaseCount=\${offer.pricingPhases.pricingPhaseList.size}"
                                )
                            }
                        }
                        callback(this.productDetailsList)
`,
  'Android returned product and eligible offer diagnostics'
);

implementation = replaceRequired(
  implementation,
  `                        Log.e(TAG, "Product ID '$productId' not found in fetched details. Call getProducts first.")
`,
  `                        Log.e(
                            TAG,
                            "[BillingDiagnostics] Product details missing for productId=$productId " +
                                "cachedProductIds=\${productDetailsList.map { it.productId }} " +
                                "lastResponseCode=\${lastBillingResponseCode ?: "none"} " +
                                "lastDebugMessage=\\\"\${lastBillingDebugMessage ?: "none"}\\\""
                        )
`,
  'Android missing cached product diagnostics'
);

if (!implementation.includes('[BillingDiagnostics] stage=selectOffer')) {
  implementation = replaceRequired(
    implementation,
    `                 val productDetailsParamsList = listOf(
                     BillingFlowParams.ProductDetailsParams.newBuilder()
                         .setProductDetails(productDetails)
                         // If this were a subscription offer, you'd set the offer token here:
                         // .setOfferToken(selectedOfferToken)
                         .build()
                 )
`,
    `                 val productDetailsParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
                     .setProductDetails(productDetails)

                 productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken?.let { offerToken ->
                     productDetailsParamsBuilder.setOfferToken(offerToken)
                 }

                 val productDetailsParamsList = listOf(productDetailsParamsBuilder.build())
`,
    'Android subscription offer token'
  );
}

implementation = replaceRequired(
  implementation,
  `                 val productDetailsParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
                     .setProductDetails(productDetails)

                 productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken?.let { offerToken ->
                     productDetailsParamsBuilder.setOfferToken(offerToken)
                 }
`,
  `                 val productDetailsParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
                     .setProductDetails(productDetails)

                 val eligibleOffers = productDetails.subscriptionOfferDetails.orEmpty()
                 val selectedOffer = eligibleOffers.firstOrNull()
                 Log.i(
                     TAG,
                     "[BillingDiagnostics] stage=selectOffer productId=$productId " +
                         "productDetailsReturned=true eligibleOfferReturned=\${eligibleOffers.isNotEmpty()} " +
                         "eligibleOfferCount=\${eligibleOffers.size} selectedOffer=\${selectedOffer != null} " +
                         "selectedBasePlanId=\${selectedOffer?.basePlanId ?: "none"} " +
                         "selectedOfferId=\${selectedOffer?.offerId ?: "base-plan-or-none"}"
                 )
                 selectedOffer?.offerToken?.let { offerToken ->
                     productDetailsParamsBuilder.setOfferToken(offerToken)
                 }
`,
  'Android eligible subscription offer diagnostics'
);

implementation = replaceRequired(
  implementation,
  `                 val billingResult = billingClient.launchBillingFlow(activity, billingFlowParams)

                 // Check immediate result of launching the flow (doesn't indicate purchase success yet)
`,
  `                 val billingResult = billingClient.launchBillingFlow(activity, billingFlowParams)
                 logBillingResult("launchBillingFlow", billingResult)

                 // Check immediate result of launching the flow (doesn't indicate purchase success yet)
`,
  'Android launch billing flow diagnostics'
);

implementation = replaceRequired(
  implementation,
  `                 // --- PBL 7 Compatibility Note ---
                 // The use of ProductDetailsParams is the standard way since PBL 5 and remains correct for PBL 7.
                 // For subscription updates/downgrades (not shown here), the setSubscriptionReplacementMode would be used
                 // instead of the removed setReplaceProrationMode.
`,
  `                 // --- PBL 9 Compatibility Note ---
                 // ProductDetailsParams remains the standard billing-flow API for PBL 9.
                 // For subscription updates/downgrades (not shown here), setSubscriptionReplacementMode is used.
`,
  'Android Billing compatibility comment'
);

implementation = replaceRequired(
  implementation,
  `            if (productType == "non-consumable") {
                // For non-consumable products, acknowledge instead of consuming
                Log.i(TAG, "Purchase successful for non-consumable \${purchase.products.joinToString()}, initiating acknowledgement. Order ID: \${purchase.orderId}")
                acknowledgePurchase(purchase)
            } else {
`,
  `            if (productType == "non-consumable" || productType == "subscription" || productType == "subs") {
                Log.i(TAG, "Purchase successful for durable product \${purchase.products.joinToString()}, initiating acknowledgement. Order ID: \${purchase.orderId}")
                acknowledgePurchase(purchase)
            } else {
`,
  'Android durable purchase acknowledgement'
);

implementation = replaceBetween(
  implementation,
  `    fun getActivePurchases(callback: (List<TransactionDetails>) -> Unit) {
`,
  `    
    /**
     * Restore purchases - returns list of active purchases like iOS
     */
`,
  `    fun getActivePurchases(callback: (List<TransactionDetails>) -> Unit) {
        ensureConnected(
            onConnected = {
                val activePurchases = mutableListOf<TransactionDetails>()

                fun queryPurchasesForType(productType: String, label: String, done: () -> Unit) {
                    Log.d(TAG, "Getting active $label purchases...")
                    val params = QueryPurchasesParams.newBuilder()
                        .setProductType(productType)
                        .build()

                    billingClient.queryPurchasesAsync(params) { billingResult, purchasesList ->
                        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                            Log.i(TAG, "Successfully queried \${purchasesList.size} active $label purchases.")
                            activePurchases.addAll(
                                purchasesList
                                    .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                                    .map { purchase -> createTransactionDetails(purchase) }
                            )
                        } else {
                            Log.e(TAG, "Error querying $label purchases: \${billingResult.debugMessage} (Code: \${billingResult.responseCode})")
                        }
                        done()
                    }
                }

                queryPurchasesForType(BillingClient.ProductType.INAPP, "INAPP") {
                    queryPurchasesForType(BillingClient.ProductType.SUBS, "SUBS") {
                        callback(activePurchases)
                    }
                }
            },
            onFailure = {
                Log.w(TAG, "Cannot get active purchases: Billing client not ready.")
                callback(emptyList())
            }
        )
    }

`,
  'Android active subscription purchases'
);

implementation = replaceRequired(
  implementation,
  `    private var lastBillingResponseCode: Int? = null
    private var lastBillingDebugMessage: String? = null

    private fun logBillingResult(stage: String, billingResult: BillingResult) {
        lastBillingResponseCode = billingResult.responseCode
        lastBillingDebugMessage = billingResult.debugMessage
        Log.d(TAG, "[BillingDiagnostics] stage=$stage responseCode=\${billingResult.responseCode} debugMessage=\\\"\${billingResult.debugMessage}\\\"")
    }
`,
  `    private var lastBillingResponseCode: Int? = null
    private var lastBillingDebugMessage: String? = null
    private var lastBillingStage = "initializing"
    private var lastBillingFailedCheck = "none"
    private var diagnosticRequestedProductIds = emptyList<String>()
    private var diagnosticReturnedProductIds = emptyList<String>()
    private var diagnosticProductDetailsReturned = false
    private var diagnosticEligibleOfferReturned = false
    private var diagnosticEligibleOfferCount = 0
    private var diagnosticSelectedBasePlanId = "none"
    private var diagnosticSelectedOfferId = "none"

    private fun sanitizeDiagnosticText(value: String?): String {
        if (value.isNullOrBlank()) return "No debug message supplied by Google Play."
        return value
            .replace(Regex("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\\\.[A-Z]{2,}", RegexOption.IGNORE_CASE), "[redacted-email]")
            .replace(Regex("(?i)\\\\b(purchaseToken|token|orderId|accountId|email)\\\\s*[:=]\\\\s*[^\\\\s,;]+"), "$1=[redacted]")
            .take(500)
    }

    private fun logBillingResult(stage: String, billingResult: BillingResult) {
        lastBillingStage = stage
        lastBillingResponseCode = billingResult.responseCode
        lastBillingDebugMessage = sanitizeDiagnosticText(billingResult.debugMessage)
        Log.d(TAG, "[BillingDiagnostics] stage=$stage responseCode=\${billingResult.responseCode} debugMessage=\\\"\${lastBillingDebugMessage}\\\"")
    }
`,
  'Android billing diagnostic snapshot state'
);

implementation = replaceRequired(
  implementation,
  `        logBillingResult("onPurchasesUpdated", billingResult)
        Log.d(TAG, "[BillingDiagnostics] stage=onPurchasesUpdated purchaseCount=\${purchases?.size ?: 0}")
`,
  `        logBillingResult("onPurchasesUpdated", billingResult)
        lastBillingFailedCheck = if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) "none" else "purchase_update_failed"
        Log.d(TAG, "[BillingDiagnostics] stage=onPurchasesUpdated purchaseCount=\${purchases?.size ?: 0}")
`,
  'Android purchase update failure snapshot'
);

implementation = replaceRequired(
  implementation,
  `            override fun onBillingSetupFinished(billingResult: BillingResult) {
                logBillingResult("onBillingSetupFinished", billingResult)
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
`,
  `            override fun onBillingSetupFinished(billingResult: BillingResult) {
                logBillingResult("onBillingSetupFinished", billingResult)
                lastBillingFailedCheck = if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) "none" else "billing_setup_failed"
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
`,
  'Android billing setup failure snapshot'
);

implementation = replaceRequired(
  implementation,
  `            override fun onBillingServiceDisconnected() {
                isBillingConnected = false
                logBillingReadiness("onBillingServiceDisconnected")
`,
  `            override fun onBillingServiceDisconnected() {
                isBillingConnected = false
                lastBillingStage = "onBillingServiceDisconnected"
                lastBillingFailedCheck = "billing_service_disconnected"
                logBillingReadiness("onBillingServiceDisconnected")
`,
  'Android billing disconnect failure snapshot'
);

implementation = replaceRequired(
  implementation,
  `    fun canMakePurchases(): Boolean {
        // Check both initialization and connection status
        val allowed = ::billingClient.isInitialized && billingClient.isReady && isBillingConnected
        logBillingReadiness("canMakePurchases allowed=$allowed")
        return allowed
    }
`,
  `    fun canMakePurchases(): Boolean {
        // Check both initialization and connection status
        val initialized = ::billingClient.isInitialized
        val ready = initialized && billingClient.isReady
        val allowed = initialized && ready && isBillingConnected
        lastBillingStage = "canMakePurchases"
        lastBillingFailedCheck = when {
            !initialized -> "billing_client_not_initialized"
            !ready -> "billing_client_not_ready"
            !isBillingConnected -> "billing_service_not_connected"
            else -> "none"
        }
        logBillingReadiness("canMakePurchases allowed=$allowed")
        return allowed
    }
`,
  'Android can make purchases failure snapshot'
);

implementation = replaceRequired(
  implementation,
  `    // Fetch product details
`,
  `    fun getBillingDiagnostics(): BillingDiagnosticsSnapshot {
        val initialized = ::billingClient.isInitialized
        val ready = initialized && billingClient.isReady
        return BillingDiagnosticsSnapshot(
            allowed = initialized && ready && isBillingConnected,
            billingClientInitialized = initialized,
            billingClientReady = ready,
            billingConnected = isBillingConnected,
            lastStage = lastBillingStage,
            failedCheck = lastBillingFailedCheck,
            responseCode = lastBillingResponseCode,
            debugMessage = sanitizeDiagnosticText(lastBillingDebugMessage),
            productDetailsReturned = diagnosticProductDetailsReturned,
            eligibleOfferReturned = diagnosticEligibleOfferReturned,
            eligibleOfferCount = diagnosticEligibleOfferCount,
            selectedBasePlanId = diagnosticSelectedBasePlanId,
            selectedOfferId = diagnosticSelectedOfferId,
            requestedProductIds = diagnosticRequestedProductIds.toList(),
            returnedProductIds = diagnosticReturnedProductIds.toList()
        )
    }

    fun recordDiagnosticFailure(stage: String, failedCheck: String, debugMessage: String) {
        lastBillingStage = stage
        lastBillingFailedCheck = failedCheck
        lastBillingDebugMessage = sanitizeDiagnosticText(debugMessage)
    }

    // Fetch product details
`,
  'Android billing diagnostic snapshot accessor'
);

implementation = replaceRequired(
  implementation,
  `    fun getProducts(productIds: List<String>, productType: String? = null, callback: (List<ProductDetails>) -> Unit) {
        ensureConnected(
`,
  `    fun getProducts(productIds: List<String>, productType: String? = null, callback: (List<ProductDetails>) -> Unit) {
        lastBillingStage = "getProducts"
        lastBillingFailedCheck = "none"
        diagnosticRequestedProductIds = productIds.toList()
        diagnosticReturnedProductIds = emptyList()
        diagnosticProductDetailsReturned = false
        diagnosticEligibleOfferReturned = false
        diagnosticEligibleOfferCount = 0
        diagnosticSelectedBasePlanId = "none"
        diagnosticSelectedOfferId = "none"
        ensureConnected(
`,
  'Android product query diagnostic reset'
);

implementation = replaceRequired(
  implementation,
  `                        callback(this.productDetailsList)
                    } else {
                        Log.e(TAG, "Failed to query product details: \${billingResult.debugMessage} (Code: \${billingResult.responseCode})")
                        this.productDetailsList.clear()
`,
  `                        diagnosticReturnedProductIds = this.productDetailsList.map { it.productId }
                        diagnosticProductDetailsReturned = this.productDetailsList.isNotEmpty()
                        val eligibleOffers = this.productDetailsList.flatMap { it.subscriptionOfferDetails.orEmpty() }
                        diagnosticEligibleOfferReturned = eligibleOffers.isNotEmpty()
                        diagnosticEligibleOfferCount = eligibleOffers.size
                        lastBillingFailedCheck = when {
                            this.productDetailsList.isEmpty() -> "product_details_not_returned"
                            billingProductType == BillingClient.ProductType.SUBS && eligibleOffers.isEmpty() -> "eligible_offer_not_returned"
                            else -> "none"
                        }
                        callback(this.productDetailsList)
                    } else {
                        Log.e(TAG, "Failed to query product details: \${billingResult.debugMessage} (Code: \${billingResult.responseCode})")
                        lastBillingFailedCheck = "product_query_failed"
                        diagnosticReturnedProductIds = emptyList()
                        diagnosticProductDetailsReturned = false
                        diagnosticEligibleOfferReturned = false
                        diagnosticEligibleOfferCount = 0
                        this.productDetailsList.clear()
`,
  'Android product query result snapshot'
);

implementation = replaceRequired(
  implementation,
  `            onFailure = {
                Log.e(TAG, "Cannot get products: Billing client not ready.")
                callback(emptyList())
`,
  `            onFailure = {
                lastBillingStage = "getProducts"
                if (lastBillingFailedCheck == "none") lastBillingFailedCheck = "billing_client_not_ready"
                Log.e(TAG, "Cannot get products: Billing client not ready.")
                callback(emptyList())
`,
  'Android product query connection failure snapshot'
);

implementation = replaceRequired(
  implementation,
  `                        )
                        callback(PurchaseResult(
                            status = "failed",
                            errorCode = "ERR_INVALID_PRODUCT_ID",
`,
  `                        )
                        lastBillingStage = "purchaseProduct"
                        lastBillingFailedCheck = "cached_product_details_missing"
                        callback(PurchaseResult(
                            status = "failed",
                            errorCode = "ERR_INVALID_PRODUCT_ID",
`,
  'Android missing cached product failure snapshot'
);

implementation = replaceRequired(
  implementation,
  `                 val eligibleOffers = productDetails.subscriptionOfferDetails.orEmpty()
                 val selectedOffer = eligibleOffers.firstOrNull()
                 Log.i(
`,
  `                 val eligibleOffers = productDetails.subscriptionOfferDetails.orEmpty()
                 val selectedOffer = eligibleOffers.firstOrNull()
                 lastBillingStage = "selectOffer"
                 diagnosticProductDetailsReturned = true
                 diagnosticEligibleOfferReturned = eligibleOffers.isNotEmpty()
                 diagnosticEligibleOfferCount = eligibleOffers.size
                 diagnosticSelectedBasePlanId = selectedOffer?.basePlanId ?: "none"
                 diagnosticSelectedOfferId = selectedOffer?.offerId ?: if (selectedOffer != null) "base-plan" else "none"
                 lastBillingFailedCheck = if (
                     productDetails.productType == BillingClient.ProductType.SUBS && selectedOffer == null
                 ) "eligible_offer_not_returned" else "none"
                 Log.i(
`,
  'Android eligible offer selection snapshot'
);

implementation = replaceRequired(
  implementation,
  `                 val billingResult = billingClient.launchBillingFlow(activity, billingFlowParams)
                 logBillingResult("launchBillingFlow", billingResult)

                 // Check immediate result of launching the flow (doesn't indicate purchase success yet)
`,
  `                 val billingResult = billingClient.launchBillingFlow(activity, billingFlowParams)
                 logBillingResult("launchBillingFlow", billingResult)
                 lastBillingFailedCheck = if (
                     billingResult.responseCode == BillingClient.BillingResponseCode.OK
                 ) "none" else "launch_billing_flow_failed"

                 // Check immediate result of launching the flow (doesn't indicate purchase success yet)
`,
  'Android billing flow launch snapshot'
);

implementation = replaceRequired(
  implementation,
  `            onFailure = {
                 Log.e(TAG, "Cannot purchase: Billing client not ready.")
                 callback(PurchaseResult(
`,
  `            onFailure = {
                 lastBillingStage = "purchaseProduct"
                 if (lastBillingFailedCheck == "none") lastBillingFailedCheck = "billing_client_not_ready"
                 Log.e(TAG, "Cannot purchase: Billing client not ready.")
                 callback(PurchaseResult(
`,
  'Android purchase connection failure snapshot'
);

implementation = replaceRequired(
  implementation,
  `    // --- Data Classes for Results ---

    data class PurchaseResult(
`,
  `    // --- Data Classes for Results ---

    data class BillingDiagnosticsSnapshot(
        val allowed: Boolean,
        val billingClientInitialized: Boolean,
        val billingClientReady: Boolean,
        val billingConnected: Boolean,
        val lastStage: String,
        val failedCheck: String,
        val responseCode: Int?,
        val debugMessage: String,
        val productDetailsReturned: Boolean,
        val eligibleOfferReturned: Boolean,
        val eligibleOfferCount: Int,
        val selectedBasePlanId: String,
        val selectedOfferId: String,
        val requestedProductIds: List<String>,
        val returnedProductIds: List<String>
    )

    data class PurchaseResult(
`,
  'Android billing diagnostics data class'
);

if (!implementation.includes('private data class PendingBillingOperation')) {
  implementation = replaceBetween(
    implementation,
    `    private fun connectToBillingService() {
`,
    `    fun canMakePurchases(): Boolean {
`,
    `    private data class PendingBillingOperation(
        val onConnected: () -> Unit,
        val onFailure: () -> Unit
    )

    private val pendingBillingOperations = mutableListOf<PendingBillingOperation>()
    private var isBillingConnecting = false

    private fun completePendingBillingOperations(connected: Boolean) {
        val operations = pendingBillingOperations.toList()
        pendingBillingOperations.clear()
        operations.forEach { operation ->
            try {
                if (connected) operation.onConnected() else operation.onFailure()
            } catch (error: Exception) {
                Log.e(TAG, "Queued billing operation failed after connection completed.", error)
                if (connected) operation.onFailure()
            }
        }
    }

    private fun connectToBillingService() {
        if (!::billingClient.isInitialized) {
            Log.e(TAG, "Billing client not initialized before connecting.")
            lastBillingStage = "connectToBillingService"
            lastBillingFailedCheck = "billing_client_not_initialized"
            completePendingBillingOperations(false)
            return
        }

        if (billingClient.isReady) {
            isBillingConnected = true
            isBillingConnecting = false
            completePendingBillingOperations(true)
            return
        }

        if (isBillingConnecting) {
            Log.d(TAG, "BillingClient connection already in progress; operation queued.")
            return
        }

        isBillingConnecting = true
        Log.d(TAG, "Starting BillingClient connection...")
        try {
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(billingResult: BillingResult) {
                    isBillingConnecting = false
                    logBillingResult("onBillingSetupFinished", billingResult)
                    val connected = billingResult.responseCode == BillingClient.BillingResponseCode.OK
                    isBillingConnected = connected
                    lastBillingFailedCheck = if (connected) "none" else "billing_setup_failed"

                    if (connected) {
                        Log.i(TAG, "Billing Client Setup Finished Successfully.")
                        completePendingBillingOperations(true)
                        queryPurchasesAsync()
                    } else {
                        Log.e(TAG, "Billing Client Setup Failed: \${billingResult.debugMessage} (Code: \${billingResult.responseCode})")
                        completePendingBillingOperations(false)
                    }
                }

                override fun onBillingServiceDisconnected() {
                    isBillingConnecting = false
                    isBillingConnected = false
                    lastBillingStage = "onBillingServiceDisconnected"
                    lastBillingFailedCheck = "billing_service_disconnected"
                    logBillingReadiness("onBillingServiceDisconnected")
                    Log.w(TAG, "Billing Service Disconnected. The next operation will reconnect.")
                    completePendingBillingOperations(false)
                }
            })
        } catch (error: Exception) {
            isBillingConnecting = false
            isBillingConnected = false
            lastBillingStage = "connectToBillingService"
            lastBillingFailedCheck = "billing_connection_exception"
            lastBillingDebugMessage = sanitizeDiagnosticText(error.message)
            Log.e(TAG, "BillingClient connection failed before setup completed.", error)
            completePendingBillingOperations(false)
        }
    }

    private fun ensureConnected(onConnected: () -> Unit, onFailure: () -> Unit) {
        if (::billingClient.isInitialized && billingClient.isReady) {
            isBillingConnected = true
            onConnected()
            return
        }

        pendingBillingOperations.add(PendingBillingOperation(onConnected, onFailure))
        connectToBillingService()
    }

`,
    'Android asynchronous billing connection queue'
  );
}

implementation = replaceRequired(
  implementation,
  `    init {
        initializeBillingClient()
    }
`,
  `    private val pendingBillingOperations = mutableListOf<PendingBillingOperation>()
    private var isBillingConnecting = false

    init {
        initializeBillingClient()
    }
`,
  'Android billing connection state initialization order'
);

implementation = replaceRequired(
  implementation,
  `    private data class PendingBillingOperation(
        val onConnected: () -> Unit,
        val onFailure: () -> Unit
    )

    private val pendingBillingOperations = mutableListOf<PendingBillingOperation>()
    private var isBillingConnecting = false

    private fun completePendingBillingOperations(connected: Boolean) {
`,
  `    private data class PendingBillingOperation(
        val onConnected: () -> Unit,
        val onFailure: () -> Unit
    )

    private fun completePendingBillingOperations(connected: Boolean) {
`,
  'Android duplicate late billing connection state removal'
);

const connectionStateIndex = implementation.indexOf('private val pendingBillingOperations');
const billingInitializationIndex = implementation.indexOf('init {\n        initializeBillingClient()');
if (connectionStateIndex === -1 || billingInitializationIndex === -1 || connectionStateIndex > billingInitializationIndex) {
  throw new Error('Android billing connection state must be initialized before BillingClient startup.');
}

implementation = replaceRequired(
  implementation,
  `        val allowed = initialized && ready && isBillingConnected
        lastBillingStage = "canMakePurchases"
        lastBillingFailedCheck = when {
            !initialized -> "billing_client_not_initialized"
            !ready -> "billing_client_not_ready"
            !isBillingConnected -> "billing_service_not_connected"
            else -> "none"
        }
`,
  `        val allowed = initialized && ready
        isBillingConnected = allowed
        lastBillingStage = "canMakePurchases"
        lastBillingFailedCheck = when {
            !initialized -> "billing_client_not_initialized"
            !ready -> "billing_client_not_ready"
            else -> "none"
        }
`,
  'Android billing readiness source of truth'
);

implementation = replaceRequired(
  implementation,
  `                 selectedOffer?.offerToken?.let { offerToken ->
                     productDetailsParamsBuilder.setOfferToken(offerToken)
                 }
`,
  `                 if (productDetails.productType == BillingClient.ProductType.SUBS && selectedOffer == null) {
                     callback(PurchaseResult(
                         status = "failed",
                         errorCode = "NO_ELIGIBLE_SUBSCRIPTION_OFFER",
                         errorMessage = "Google Play returned the subscription, but no eligible base plan or offer is available for this account."
                     ))
                     return@ensureConnected
                 }

                 selectedOffer?.offerToken?.let { offerToken ->
                     productDetailsParamsBuilder.setOfferToken(offerToken)
                 }
`,
  'Android missing eligible subscription offer guard'
);

implementation = replaceRequired(
  implementation,
  '    fun purchaseProduct(activity: Activity, productId: String, userId: String? = null, productType: String? = null, callback: (PurchaseResult) -> Unit) {\n',
  '    fun purchaseProduct(activity: Activity, productId: String, userId: String? = null, productType: String? = null, offerToken: String? = null, callback: (PurchaseResult) -> Unit) {\n',
  'Android purchase selected offer token parameter'
);

implementation = replaceRequired(
  implementation,
  `                 val eligibleOffers = productDetails.subscriptionOfferDetails.orEmpty()
                 val selectedOffer = eligibleOffers.firstOrNull()
`,
  `                 val eligibleOffers = productDetails.subscriptionOfferDetails.orEmpty()
                 val selectedOffer = if (!offerToken.isNullOrBlank()) {
                     eligibleOffers.firstOrNull { it.offerToken == offerToken }
                 } else {
                     eligibleOffers.firstOrNull { offer ->
                         offer.pricingPhases.pricingPhaseList.firstOrNull()?.priceAmountMicros == 0L
                     } ?: eligibleOffers.firstOrNull()
                 }
`,
  'Android exact purchase offer selection'
);

implementation = replaceRequired(
  implementation,
  `                 lastBillingFailedCheck = if (
                     productDetails.productType == BillingClient.ProductType.SUBS && selectedOffer == null
                 ) "eligible_offer_not_returned" else "none"
`,
  `                 lastBillingFailedCheck = when {
                     productDetails.productType != BillingClient.ProductType.SUBS -> "none"
                     !offerToken.isNullOrBlank() && selectedOffer == null -> "requested_offer_not_returned"
                     selectedOffer == null -> "eligible_offer_not_returned"
                     else -> "none"
                 }
`,
  'Android selected offer failure diagnostics'
);

implementation = replaceRequired(
  implementation,
  `                 if (productDetails.productType == BillingClient.ProductType.SUBS && selectedOffer == null) {
                     callback(PurchaseResult(
                         status = "failed",
                         errorCode = "NO_ELIGIBLE_SUBSCRIPTION_OFFER",
                         errorMessage = "Google Play returned the subscription, but no eligible base plan or offer is available for this account."
                     ))
`,
  `                 if (productDetails.productType == BillingClient.ProductType.SUBS && selectedOffer == null) {
                     val requestedOfferMissing = !offerToken.isNullOrBlank()
                     callback(PurchaseResult(
                         status = "failed",
                         errorCode = if (requestedOfferMissing) "REQUESTED_SUBSCRIPTION_OFFER_UNAVAILABLE" else "NO_ELIGIBLE_SUBSCRIPTION_OFFER",
                         errorMessage = if (requestedOfferMissing) {
                             "The subscription offer returned by Google Play is no longer eligible. Refresh the subscription and try again."
                         } else {
                             "Google Play returned the subscription, but no eligible base plan or offer is available for this account."
                         }
                     ))
`,
  'Android requested offer unavailable message'
);

writeIfChanged(implementationPath, implementation);


let plugin = fs.readFileSync(pluginPath, 'utf8');

plugin = replaceRequired(
  plugin,
  `    private lateinit var implementation: InAppPurchase
    private val TAG = "InAppPurchasePlugin" // Tag for plugin-level logging

    /**
     * Called when the plugin is first loaded.
     * Initialize the InAppPurchase implementation here.
     */
    override fun load() {
        Log.d(TAG, "Loading InAppPurchasePlugin and initializing implementation.")
        // Pass the application context
        implementation = InAppPurchase(context)
    }
`,
  `    private var implementation: InAppPurchase? = null
    private var initializationError = "Google Play Billing has not been initialized yet."
    private val TAG = "InAppPurchasePlugin" // Tag for plugin-level logging

    override fun load() {
        // Keep plugin registration independent from BillingClient startup. If BillingClient
        // throws while the bridge is loading, Capacitor otherwise omits the whole plugin and
        // JavaScript can only report that it is "not implemented".
        Log.d(TAG, "InAppPurchasePlugin registered; BillingClient will initialize on first use.")
    }

    @Synchronized
    private fun initializeBilling(): InAppPurchase? {
        implementation?.let { return it }

        return try {
            InAppPurchase(context).also {
                implementation = it
                initializationError = ""
                Log.i(TAG, "[BillingDiagnostics] BillingClient initialized on demand.")
            }
        } catch (error: Throwable) {
            val message = error.message?.take(300) ?: "No initialization message was supplied."
            initializationError = "\${error.javaClass.simpleName}: $message"
            Log.e(TAG, "[BillingDiagnostics] BillingClient initialization failed: $initializationError", error)
            null
        }
    }

    private fun requireBilling(call: PluginCall, stage: String): InAppPurchase? {
        val billing = initializeBilling()
        if (billing == null) {
            Log.e(TAG, "[BillingDiagnostics] stage=$stage failure=billing_initialization_failed detail=$initializationError")
            call.reject(
                "Google Play Billing could not initialize: $initializationError",
                "ERR_BILLING_INITIALIZATION"
            )
        }
        return billing
    }
`,
  'Android lazy BillingClient initialization'
);

plugin = replaceRequired(
  plugin,
  `import com.getcapacitor.annotation.CapacitorPlugin
`,
  `import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
`,
  'Android billing diagnostics JSON null import'
);

plugin = replaceRequired(
  plugin,
  `        Log.d(TAG, "getProducts called for IDs: $productIds")

        // Call the implementation method asynchronously
`,
  `        val productType = call.getString("productType")?.trim()
        Log.d(TAG, "getProducts called for IDs: $productIds with productType: \${productType ?: "inapp"}")

        // Call the implementation method asynchronously
`,
  'Android plugin product type read'
);

plugin = replaceRequired(
  plugin,
  '        implementation.getProducts(productIds) { productDetailsList ->\n',
  '        implementation.getProducts(productIds, productType) { productDetailsList ->\n',
  'Android plugin product type pass-through'
);

plugin = replaceRequired(
  plugin,
  `        Log.d(TAG, "canMakePurchases called, result: $canMake")
`,
  `        Log.d(TAG, "[BillingDiagnostics] bridge=canMakePurchases allowed=$canMake")
`,
  'Android plugin purchase availability diagnostics'
);

plugin = replaceRequired(
  plugin,
  `                 Log.d(TAG, "Received \${productDetailsList.size} product details from implementation.")
                 val products = JSArray()
`,
  `                 Log.i(
                     TAG,
                     "[BillingDiagnostics] bridge=getProducts productDetailsReturned=\${productDetailsList.isNotEmpty()} " +
                         "productCount=\${productDetailsList.size} productIds=\${productDetailsList.map { it.productId }}"
                 )
                 val products = JSArray()
`,
  'Android plugin returned product diagnostics'
);

plugin = replaceRequired(
  plugin,
  `                 productDetailsList.forEach { productDetails ->
                     val product = JSObject().apply {
`,
  `                 productDetailsList.forEach { productDetails ->
                     val eligibleOffers = productDetails.subscriptionOfferDetails.orEmpty()
                     Log.i(
                         TAG,
                         "[BillingDiagnostics] bridge=getProducts productId=\${productDetails.productId} " +
                             "eligibleOfferReturned=\${eligibleOffers.isNotEmpty()} eligibleOfferCount=\${eligibleOffers.size}"
                     )
                     val product = JSObject().apply {
`,
  'Android plugin eligible offer diagnostics'
);

plugin = replaceRequired(
  plugin,
  `                         // Safely access one-time purchase details (for INAPP)
                         productDetails.oneTimePurchaseOfferDetails?.let { details ->
                             put("price", details.formattedPrice)
                             // Price in micros / 1,000,000 = price as decimal
                             put("priceAsDecimal", details.priceAmountMicros / 1_000_000.0)
                             put("currency", details.priceCurrencyCode)
                         } ?: run {
                             // Handle cases where offer details might be missing (e.g., SUBS base plans need different handling)
                             Log.w(TAG, "No oneTimePurchaseOfferDetails found for productId: \${productDetails.productId} (Type: \${productDetails.productType})")
                             // Provide defaults or N/A
                             put("price", "N/A")
                             put("priceAsDecimal", 0.0)
                             put("currency", "N/A")
                         }

                         // If handling subscriptions, you would access subscriptionOfferDetails list here
                         // productDetails.subscriptionOfferDetails?.forEach { offer -> ... }
`,
  `                         productDetails.oneTimePurchaseOfferDetails?.let { details ->
                             put("price", details.formattedPrice)
                             put("priceAsDecimal", details.priceAmountMicros / 1_000_000.0)
                             put("currency", details.priceCurrencyCode)
                         } ?: run {
                             val subscriptionOffer = productDetails.subscriptionOfferDetails?.firstOrNull()
                             val pricingPhase = subscriptionOffer?.pricingPhases?.pricingPhaseList?.firstOrNull()
                             if (pricingPhase != null) {
                                 put("price", pricingPhase.formattedPrice)
                                 put("priceAsDecimal", pricingPhase.priceAmountMicros / 1_000_000.0)
                                 put("currency", pricingPhase.priceCurrencyCode)
                                 subscriptionOffer?.offerToken?.let { put("offerToken", it) }
                             } else {
                                 Log.w(TAG, "No price details found for productId: \${productDetails.productId} (Type: \${productDetails.productType})")
                                 put("price", "N/A")
                                 put("priceAsDecimal", 0.0)
                                 put("currency", "N/A")
                             }
                         }
`,
  'Android plugin subscription price mapping'
);

plugin = replaceRequired(
  plugin,
  `        val currentActivity = activity ?: run {
            Log.e(TAG, "Activity context is null, cannot launch purchase flow.")
`,
  `        val currentActivity = activity ?: run {
            Log.e(TAG, "[BillingDiagnostics] bridge=purchaseProduct failure=activity_missing BillingResult=unavailable")
`,
  'Android plugin missing activity diagnostics'
);

plugin = replaceRequired(
  plugin,
  `        Log.d(TAG, "purchaseProduct called for ID: $productId" + if (userId != null) " with userId: $userId" else "" + if (productType != null) " with productType: $productType" else "")
`,
  `        Log.d(
            TAG,
            "[BillingDiagnostics] bridge=purchaseProduct productId=$productId " +
                "productType=\${productType ?: "unspecified"} userIdProvided=\${!userId.isNullOrBlank()}"
        )
`,
  'Android plugin purchase request diagnostics'
);

plugin = replaceRequired(
  plugin,
  `    /**
     * Retrieves product details for the given product IDs.
`,
  `    @PluginMethod
    fun getBillingDiagnostics(call: PluginCall) {
        val diagnostics = implementation.getBillingDiagnostics()
        val requestedProductIds = JSArray()
        diagnostics.requestedProductIds.forEach { requestedProductIds.put(it) }
        val returnedProductIds = JSArray()
        diagnostics.returnedProductIds.forEach { returnedProductIds.put(it) }

        call.resolve(JSObject().apply {
            put("allowed", diagnostics.allowed)
            put("billingClientInitialized", diagnostics.billingClientInitialized)
            put("billingClientReady", diagnostics.billingClientReady)
            put("billingConnected", diagnostics.billingConnected)
            put("lastStage", diagnostics.lastStage)
            put("failedCheck", diagnostics.failedCheck)
            put("responseCode", diagnostics.responseCode ?: JSONObject.NULL)
            put("debugMessage", diagnostics.debugMessage)
            put("productDetailsReturned", diagnostics.productDetailsReturned)
            put("eligibleOfferReturned", diagnostics.eligibleOfferReturned)
            put("eligibleOfferCount", diagnostics.eligibleOfferCount)
            put("selectedBasePlanId", diagnostics.selectedBasePlanId)
            put("selectedOfferId", diagnostics.selectedOfferId)
            put("requestedProductIds", requestedProductIds)
            put("returnedProductIds", returnedProductIds)
        })
    }

    /**
     * Retrieves product details for the given product IDs.
`,
  'Android billing diagnostics bridge method'
);

plugin = replaceRequired(
  plugin,
  `        val currentActivity = activity ?: run {
            Log.e(TAG, "[BillingDiagnostics] bridge=purchaseProduct failure=activity_missing BillingResult=unavailable")
`,
  `        val currentActivity = activity ?: run {
            implementation.recordDiagnosticFailure(
                "purchaseProduct",
                "activity_missing",
                "Android activity was unavailable; Google Play Billing was not called."
            )
            Log.e(TAG, "[BillingDiagnostics] bridge=purchaseProduct failure=activity_missing BillingResult=unavailable")
`,
  'Android plugin activity failure snapshot'
);

plugin = replaceRequired(
  plugin,
  `                             val subscriptionOffer = productDetails.subscriptionOfferDetails?.firstOrNull()
`,
  `                             val subscriptionOffers = productDetails.subscriptionOfferDetails.orEmpty()
                             val subscriptionOffer = subscriptionOffers.firstOrNull { offer ->
                                 offer.pricingPhases.pricingPhaseList.firstOrNull()?.priceAmountMicros == 0L
                             } ?: subscriptionOffers.firstOrNull()
`,
  'Android free trial offer preference'
);

plugin = replaceRequired(
  plugin,
  `        val userId = call.getString("userId")?.trim() // Get optional userId
        val productType = call.getString("productType")?.trim() // Get optional productType
`,
  `        val userId = call.getString("userId")?.trim() // Get optional userId
        val productType = call.getString("productType")?.trim() // Get optional productType
        val offerToken = call.getString("offerToken")?.trim() // Exact eligible offer returned by getProducts
`,
  'Android plugin selected offer token read'
);

plugin = replaceRequired(
  plugin,
  `            "[BillingDiagnostics] bridge=purchaseProduct productId=$productId " +
                "productType=\${productType ?: "unspecified"} userIdProvided=\${!userId.isNullOrBlank()}"
`,
  `            "[BillingDiagnostics] bridge=purchaseProduct productId=$productId " +
                "productType=\${productType ?: "unspecified"} userIdProvided=\${!userId.isNullOrBlank()} " +
                "offerTokenProvided=\${!offerToken.isNullOrBlank()}"
`,
  'Android plugin selected offer diagnostics'
);

plugin = replaceRequired(
  plugin,
  `        // Call the implementation method, passing the activity, userId, productType and a callback lambda
        implementation.purchaseProduct(currentActivity, productId, userId, productType) { result ->
`,
  `        // Call the implementation method with the exact eligible offer returned to JavaScript.
        implementation.purchaseProduct(currentActivity, productId, userId, productType, offerToken) { result ->
`,
  'Android plugin selected offer token pass-through'
);

plugin = replaceRequired(
  plugin,
  `    fun canMakePurchases(call: PluginCall) {
        // Run on background thread pool potentially? Billing checks might involve IPC.
        // bridge.threadPool.submit { ... } // Consider if needed, though this check is usually fast
        val canMake = implementation.canMakePurchases()
`,
  `    fun canMakePurchases(call: PluginCall) {
        val billing = requireBilling(call, "canMakePurchases") ?: return
        // Run on background thread pool potentially? Billing checks might involve IPC.
        // bridge.threadPool.submit { ... } // Consider if needed, though this check is usually fast
        val canMake = billing.canMakePurchases()
`,
  'Android lazy billing purchase availability'
);

plugin = replaceRequired(
  plugin,
  `    fun getBillingDiagnostics(call: PluginCall) {
        val diagnostics = implementation.getBillingDiagnostics()
`,
  `    fun getBillingDiagnostics(call: PluginCall) {
        val billing = initializeBilling()
        if (billing == null) {
            call.resolve(JSObject().apply {
                put("allowed", false)
                put("billingClientInitialized", false)
                put("billingClientReady", false)
                put("billingConnected", false)
                put("lastStage", "initializeBilling")
                put("failedCheck", "billing_initialization_failed")
                put("responseCode", JSONObject.NULL)
                put("debugMessage", initializationError)
                put("productDetailsReturned", false)
                put("eligibleOfferReturned", false)
                put("eligibleOfferCount", 0)
                put("selectedBasePlanId", "none")
                put("selectedOfferId", "none")
                put("requestedProductIds", JSArray())
                put("returnedProductIds", JSArray())
            })
            return
        }

        val diagnostics = billing.getBillingDiagnostics()
`,
  'Android billing initialization diagnostics'
);

plugin = replaceRequired(
  plugin,
  `        val productType = call.getString("productType")?.trim()
        Log.d(TAG, "getProducts called for IDs: $productIds with productType: \${productType ?: "inapp"}")
`,
  `        val productType = call.getString("productType")?.trim()
        val billing = requireBilling(call, "getProducts") ?: return
        Log.d(TAG, "getProducts called for IDs: $productIds with productType: \${productType ?: "inapp"}")
`,
  'Android lazy billing product query'
);

plugin = replaceRequired(
  plugin,
  '        implementation.getProducts(productIds, productType) { productDetailsList ->\n',
  '        billing.getProducts(productIds, productType) { productDetailsList ->\n',
  'Android lazy billing product query call'
);

plugin = replaceRequired(
  plugin,
  `        val offerToken = call.getString("offerToken")?.trim() // Exact eligible offer returned by getProducts

        // Get the current activity context needed for launching the billing flow UI
`,
  `        val offerToken = call.getString("offerToken")?.trim() // Exact eligible offer returned by getProducts
        val billing = requireBilling(call, "purchaseProduct") ?: return

        // Get the current activity context needed for launching the billing flow UI
`,
  'Android lazy billing purchase request'
);

plugin = replaceRequired(
  plugin,
  `            implementation.recordDiagnosticFailure(
`,
  `            billing.recordDiagnosticFailure(
`,
  'Android lazy billing activity diagnostics'
);

plugin = replaceRequired(
  plugin,
  '        implementation.purchaseProduct(currentActivity, productId, userId, productType, offerToken) { result ->\n',
  '        billing.purchaseProduct(currentActivity, productId, userId, productType, offerToken) { result ->\n',
  'Android lazy billing purchase call'
);

plugin = replaceRequired(
  plugin,
  `    fun restorePurchases(call: PluginCall) {
        Log.d(TAG, "restorePurchases called.")
`,
  `    fun restorePurchases(call: PluginCall) {
        Log.d(TAG, "restorePurchases called.")
        val billing = requireBilling(call, "restorePurchases") ?: return
`,
  'Android lazy billing restore'
);

plugin = replaceRequired(
  plugin,
  '        implementation.restorePurchases { transactionDetailsList ->\n',
  '        billing.restorePurchases { transactionDetailsList ->\n',
  'Android lazy billing restore call'
);

plugin = replaceRequired(
  plugin,
  `    fun getActivePurchases(call: PluginCall) {
        Log.d(TAG, "getActivePurchases called.")
`,
  `    fun getActivePurchases(call: PluginCall) {
        Log.d(TAG, "getActivePurchases called.")
        val billing = requireBilling(call, "getActivePurchases") ?: return
`,
  'Android lazy billing active purchases'
);

plugin = replaceRequired(
  plugin,
  '        implementation.getActivePurchases { transactionDetailsList ->\n',
  '        billing.getActivePurchases { transactionDetailsList ->\n',
  'Android lazy billing active purchases call'
);

plugin = replaceRequired(
  plugin,
  `        // Ensure implementation is initialized before calling destroy
        // Use safe call ?. just in case load() failed or was never called.
        if (::implementation.isInitialized) {
            implementation.destroy()
        }
`,
  `        implementation?.destroy()
        implementation = null
`,
  'Android nullable billing cleanup'
);

writeIfChanged(pluginPath, plugin);

console.log('Patched capacitor-plugin-purchase Android subscription and Play Billing 9.0.0 support.');
