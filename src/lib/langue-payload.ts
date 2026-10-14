import { fr } from '@payloadcms/translations/languages/fr'
import type { Config } from 'payload'

/**
 * The language Payload speaks (ticket 221): French, and nothing else. It is the language of the
 * envelope of a refusal (« Le champ suivant n’est pas valide : Téléphone »), of Payload's own
 * refusals and default messages (« Vous n’êtes pas autorisé à effectuer cette action. », a text
 * too long), and of the admin panel.
 *
 * English is not offered at all, so nothing brings it back: Payload picks the language of a
 * request from its `payload-lng` cookie or its `Accept-Language` header, and a language it does
 * not offer falls back to French. The Local API speaks the fallback language.
 *
 * Code that refuses with Payload's own errors passes them `req.t`, the translation of the request:
 * without it, Payload writes its message in English (`new ValidationError(…, req.t)`,
 * `new Forbidden(req.t)`).
 */
export const LANGUE_DE_PAYLOAD = {
	fallbackLanguage: 'fr',
	supportedLanguages: { fr },
} satisfies NonNullable<Config['i18n']>
