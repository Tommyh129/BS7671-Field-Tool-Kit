import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageRoot = path.join(root, 'node_modules', 'capacitor-plugin-purchase');
const implementationPath = path.join(packageRoot, 'android', 'src', 'main', 'java', 'com', 'scgscorp', 'capacitorpluginpurchase', 'InAppPurchase.kt');
const pluginPath = path.join(packageRoot, 'android', 'src', 'main', 'java', 'com', 'scgscorp', 'capacitorpluginpurchase', 'InAppPurchasePlugin.kt');

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${path.relative(root, filePath)}`);
  }
}

function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) {
    return content;
  }
  if (!content.includes(search)) {
    throw new Error(`Could not patch ${label}. Expected source fragment was not found.`);
  }
  return content.replace(search, replacement);
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

requireFile(implementationPath);
requireFile(pluginPath);

let implementation = fs.readFileSync(implementationPath, 'utf8');

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

writeIfChanged(implementationPath, implementation);

let plugin = fs.readFileSync(pluginPath, 'utf8');

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

writeIfChanged(pluginPath, plugin);

console.log('Patched capacitor-plugin-purchase Android subscription support.');
