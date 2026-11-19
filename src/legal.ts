/**
 * Facts the legal pages and the cookie notice share, so they never disagree.
 * Update `PRIVACY_UPDATED` whenever src/pages/privacy.tsx changes in substance.
 */

export const PRIVACY_CONTACT_EMAIL = 'carterbhortoncbh@gmail.com'
export const PRIVACY_UPDATED = 'November 18, 2026'
/** Update whenever src/pages/terms.tsx changes in substance. */
export const TERMS_UPDATED = 'November 18, 2026'
export const MINIMUM_AGE = 13

/** localStorage key that records the cookie notice was dismissed. Bump the
 *  version to show the notice again after the cookie list changes. */
export const COOKIE_NOTICE_KEY = 'co-create:cookie-notice:v1'
