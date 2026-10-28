export function validateLicence(input: any) {
  const id = /^[A-Za-z0-9_-]{1,128}$/;
  if (!input || typeof input.licenceId !== 'string' || !id.test(input.licenceId) || input.plan !== 'business') throw Error('A valid licenceId and business plan are required.');
  if (typeof input.organisation !== 'string' || !input.organisation.trim() || input.organisation.length > 200 ||
      typeof input.invoiceReference !== 'string' || !input.invoiceReference.trim() || input.invoiceReference.length > 100) throw Error('Organisation and invoice reference are required.');
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 50) throw Error('Seat capacity must be 1 to 50.');
  if (!Array.isArray(input.memberUids) || input.memberUids.length > input.seats ||
      input.memberUids.some((uid: unknown) => typeof uid !== 'string' || !id.test(uid)) || new Set(input.memberUids).size !== input.memberUids.length) throw Error('Supply unique account UIDs within the seat limit.');
  const startsAt = Date.parse(input.startsAt), expiresAt = Date.parse(input.expiresAt);
  if (![input.startsAt, input.expiresAt].every(value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) ||
      !Number.isSafeInteger(startsAt) || !Number.isSafeInteger(expiresAt) || startsAt >= expiresAt) throw Error('Supply ordered ISO dates with time zones.');
  return {licenceId:input.licenceId as string, plan:'business' as const, organisation:input.organisation.trim(), invoiceReference:input.invoiceReference.trim(), seats:input.seats as number, memberUids:input.memberUids as string[], startsAt, expiresAt};
}

export function assertGrantEligible(profile: any, licenceId: string, now = Date.now()) {
  if (!profile || profile.deletionPending) throw Error('An account is missing or being deleted.');
  const grant = profile.invoicedBusiness;
  if (grant && !grant.revoked && grant.expiresAt > now && grant.licenceId !== licenceId) throw Error('An account belongs to another active invoiced licence.');
  // Stale provider records must be reconciled, not assumed cancelled.
  if (profile.nativeSubscription || profile.businessUntil > 0 || profile.stripeUntil > 0 || profile.businessStripeUntil > 0 ||
      profile.stripeSubscriptionId || profile.subscriptionId || profile.businessStripeSubscriptionId || profile.pendingCheckoutId || profile.isPro || profile.isBusiness) {
    throw Error('An account has existing subscription or manual-access records. Review cancellation/expiry and reconcile verified records before granting invoice access.');
  }
}
