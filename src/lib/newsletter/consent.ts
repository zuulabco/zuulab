/**
 * Consent wording shown next to the newsletter form. The exact same text is saved
 * with each subscription as the record of consent, so both read it from here.
 */
export const NEWSLETTER_CONSENT_TEXT =
  'zuulab yeniliklerinden, kampanyalarından ve indirimlerinden e-posta ile haberdar olmak için ticari elektronik ileti gönderilmesine onay veriyorum.'

/**
 * The wording once the other commercial e-mails (reminders about an unpaid order, review requests) are switched on
 * (COMMERCIAL_EMAIL_ENABLED): confirming the form then also gives the e-mail permission. Not used while that
 * switch is off, so nobody consents to mails that are not being sent.
 */
export const NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS =
  'zuulab bülteni, kampanya ve indirimlerinden, ayrıca sepetim ve siparişlerimle ilgili hatırlatmalardan e-posta ile haberdar olmak için ticari elektronik ileti gönderilmesine onay veriyorum.'

/** The newsletter wording that is in force: `commercial` is the state of the master switch */
export const newsletterConsentText = (commercial: boolean): string =>
  commercial ? NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS : NEWSLETTER_CONSENT_TEXT

/**
 * Permission for commercial e-mail that is not the newsletter (reminders about an unpaid order, review requests,
 * offers to members). Shown in the member modal and in the optional box on the payment page, and saved with the
 * permission as the record of consent. It does NOT subscribe anyone to the newsletter. Only collected while the
 * master switch (COMMERCIAL_EMAIL_ENABLED) is on.
 */
export const EMAIL_PERMISSION_TEXT =
  'zuulab tarafından, kampanya ve indirim bilgilendirmeleri ile sepetim ve siparişlerimle ilgili hatırlatma niteliğinde ticari elektronik ileti gönderilmesine onay veriyorum.'
