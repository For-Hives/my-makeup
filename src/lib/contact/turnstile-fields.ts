/**
 * The names of the two fields of the Turnstile widget in a form. A file of its own with no import, because the
 * widget (a browser component) reads them: from `turnstile.ts` it would drag the server rate limits into the
 * JavaScript of the pages that carry a form (issue 1033).
 */

/** The field the widget adds to the form: its name is Cloudflare's. */
export const TURNSTILE_TOKEN_FIELD = 'cf-turnstile-response'

/** The field of a browser that says its widget could not load. */
export const TURNSTILE_UNAVAILABLE_FIELD = 'turnstile-unavailable'
