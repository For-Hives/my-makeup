import { HOST } from './legal'

/**
 * The processors the privacy policy names, in one place (ticket 189). The page
 * `/politique-de-confidentialite` draws its list of providers from `PROVIDERS` and nothing else;
 * tests/unit/providers-policy.test.tsx compares each entry to the service the code is
 * configured for (the host of the site, the Umami instance, the S3 storage, the SMTP relay, the
 * Google issuer), so that adding or replacing a service without editing this list fails the CI.
 *
 * Plain data, no import of the server: the page is static.
 */

export type ProviderId = 'hebergement' | 'mesure' | 'photos' | 'email' | 'google'

export type Provider = {
	id: ProviderId
	/** The company, as the policy names it. */
	nom: string
	/** The sentence of the list, after the name (French, « vous » register of the legal pages). */
	phrase: string
	/**
	 * What the code is configured for, to be found by the test in the source of the setting:
	 * a host name (a domain suffix for the Umami instance), or for the host of the site the legal name of its host.
	 */
	configuration: string
}

/** Days an object waits in the bin of the photo storage before its rule erases it (README, « corbeille »; ticket 205). */
export const PHOTO_ERASURE_DAYS = 30

export const PROVIDERS: readonly Provider[] = [
	{
		id: 'hebergement',
		nom: 'netcup GmbH (Allemagne)',
		phrase: 'hébergement du site.',
		configuration: HOST.nom,
	},
	{
		id: 'mesure',
		nom: 'Contabo GmbH (Allemagne)',
		phrase: "hébergement de notre outil de mesure d'audience (Umami).",
		configuration: 'wadefade.fr',
	},
	{
		id: 'photos',
		nom: 'Cloudflare (service R2)',
		phrase: 'stockage des photos des profils.',
		configuration: 'r2.cloudflarestorage.com',
	},
	{
		id: 'email',
		nom: 'Resend, Inc. (États-Unis)',
		phrase:
			"envoi des emails du site (confirmation de l'inscription, formulaire de contact, réinitialisation du mot de passe), depuis ses serveurs situés dans l'Union européenne (Irlande) ; le transfert vers la société est encadré comme indiqué ci-dessous.",
		configuration: 'smtp.resend.com',
	},
	{
		id: 'google',
		nom: 'Google',
		phrase: 'uniquement si vous choisissez de vous connecter avec Google.',
		configuration: 'accounts.google.com',
	},
]
