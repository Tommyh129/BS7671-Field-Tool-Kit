# Invoiced Business Access

Local implementation only. No accounts have been granted access or billed.
Consumer purchases use Apple/Google Play; never add a consumer external-payment link to native checkout.
Review organisation-sales eligibility and store review notes before offering this service publicly.

## Administrator Workflow

1. Agree the business's seat count, invoice and access dates outside the app.
2. Each employee creates an account; obtain the Firebase Authentication UID, not a password.
3. Check for existing Apple, Google or Stripe subscriptions. Cancellation is not immediate expiry: arrange the handover date and verify expiry before reconciling provider records. Never erase a live subscription record to bypass the safety check. The tool does not cancel payments.
4. On a trusted administrator workstation, use Firebase Admin application-default credentials with appropriate permissions. Never put service-account keys in the app or GitHub.
5. Keep a private JSON manifest outside the repository, using this shape:

```json
{
  "licenceId": "organisation-001",
  "plan": "business",
  "organisation": "Example Electrical Ltd",
  "invoiceReference": "INV-001",
  "seats": 2,
  "startsAt": "2026-11-01T00:00:00Z",
  "expiresAt": "2026-12-01T00:00:00Z",
  "memberUids": ["FIREBASE_UID_ONE", "FIREBASE_UID_TWO"]
}
```

6. Run a dry check from the project directory:

```powershell
node --import ./scripts/register-test-loader.mjs scripts/manage-invoiced-licence.mjs --file C:\Private\licence.json
```

7. After reviewing the result, repeat with `--apply --actor ADMIN_REFERENCE` to write. This is a manual administrator action, not a public sales endpoint.
8. Renew by updating dates in the same manifest and applying again. Replace/remove UIDs to reassign seats; removed users lose that grant. To revoke the whole licence, repeat with `--revoke --apply --actor ADMIN_REFERENCE`.
9. Test with a dedicated account before provisioning customers. Business includes Pro; access starts and expires at the specified times. Signing in is required to receive this account-based entitlement.

## Deployment And Privacy

- Deploy the updated backend, Firestore rules and Storage rules together, then rebuild/sync native assets. No actual cloud changes have been made by this implementation.
- `organisationLicences` and its audit subcollection are server-only under default-deny rules. User profiles expose only licence ID, start, expiry and revocation status, not invoice details or organisation contacts.
- Protect manifests as personal data, restrict administrator access, and apply a reviewed retention schedule. The erasure tool removes user UIDs from seat membership; audit entries contain counts, not member lists.
- Retain existing Stripe webhook/restore configuration until any legacy subscribers are reconciled. Their authenticated management portal allows cancellation, not new purchases or plan changes.
- Existing subscriptions on another app/store account, or guest purchases not linked to this UID, cannot be ruled out from Firestore alone. Confirm these with the customer before invoicing. No automatic cancellation or refund is performed.
