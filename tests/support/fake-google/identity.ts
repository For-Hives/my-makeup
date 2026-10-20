/**
 * What the fake Google of the bench answers with: one of four scenarios, and a made-up identity.
 *
 * A test chooses both, and the choice travels with the authorization request, in a cookie of the
 * provider. Nothing is kept on the provider's side between two sign-ins: two tests that run at
 * the same time never see each other's identity.
 *
 * Shared by the provider, which runs alone in a container and sees this folder only, and by the
 * tool the tests call (tests/outils/faux-google.ts). Node's own modules only: nothing of bun,
 * nothing of the rest of the repository.
 */

import { createHash } from 'node:crypto'

/**
 * The four answers a test may ask for.
 *
 * - `email-verifie`: the sign-in succeeds, and Google vouches for the address.
 * - `email-non-verifie`: the sign-in succeeds, and Google says the address was never confirmed.
 * - `refus`: the person closes the consent screen. Google sends the browser back with
 *   `error=access_denied`, and no code.
 * - `panne`: Google sends the browser back with a code, then fails when the application comes
 *   to exchange it: 503, with a page and no JSON, as a real outage does.
 */
export const SCENARIOS = ['email-verifie', 'email-non-verifie', 'refus', 'panne'] as const

export type Scenario = (typeof SCENARIOS)[number]

/** A Google account that does not exist. */
export interface Identite {
	/** Google's own identifier of the account (`sub`): stable, never an address. */
	sub: string
	/** Always under a domain in `.test`: no mail can ever be delivered to it. */
	email: string
	/** Full name (`name`). */
	nom: string
	/** `given_name`. */
	prenom: string
	/** `family_name`. */
	nomDeFamille: string
	/** `picture`. Left out unless a test gives one: the real default would be fetched from Google. */
	photo?: string
}

export interface Choix {
	scenario: Scenario
	identite: Identite
}

/** What a test gives: only what matters to it. The rest is filled in. */
export interface Demande extends Partial<Identite> {
	scenario?: Scenario
}

/** The cookie of the provider that carries the choice of a test. */
export const COOKIE_DU_CHOIX = 'faux_google_choix'

/** The choice of a test cannot be used. The message is in French and never repeats an address. */
export class ChoixRefuse extends Error {
	override name = 'ChoixRefuse'
}

/** Who signs in when a test names nobody. */
const PAR_DEFAUT = {
	email: 'camille.google@example.test',
	prenom: 'Camille',
	nomDeFamille: 'Banc-de-Test',
} as const

/** Reserved for tests (RFC 6761): a name in `.test` never resolves, so an address under it reaches nobody. */
const ADRESSE_FICTIVE = /^[^\s@]{1,64}@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*test$/i

const IDENTIFIANT = /^[\w-]{1,255}$/

const LONGUEUR_MAX = 200

/** The made-up credentials of the bench say what they are: a real one never holds this word. */
export const estFactice = (valeur: string): boolean => /factice/i.test(valeur)

/**
 * The identifier Google would give this account: 21 digits, the same for the same address
 * whatever its case, so that a second sign-in is the same account.
 */
export function subDe(email: string): string {
	const empreinte = createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
	return `1${(BigInt(`0x${empreinte.slice(0, 16)}`) % 10n ** 20n).toString().padStart(20, '0')}`
}

const texte = (valeur: unknown, champ: string): string => {
	if (typeof valeur !== 'string' || valeur.trim() === '' || valeur.length > LONGUEUR_MAX)
		throw new ChoixRefuse(`Identité refusée : « ${champ} » doit être un texte de 1 à ${LONGUEUR_MAX} caractères.`)
	return valeur
}

function photoFictive(valeur: unknown): string {
	const adresse = texte(valeur, 'photo')
	const hote = URL.canParse(adresse) ? new URL(adresse).hostname : ''
	if (!/(?:^|\.)test$/i.test(hote))
		throw new ChoixRefuse('Identité refusée : la photo doit être une adresse fictive, sous un domaine en « .test ».')
	return adresse
}

/**
 * Checks a choice field by field, wherever it comes from: a test, or the cookie of a request.
 * An address that is not made up is refused here, on both sides: a real person's address never
 * goes through the fake provider.
 */
export function verifierChoix(valeur: unknown): Choix {
	if (typeof valeur !== 'object' || valeur === null) throw new ChoixRefuse('Choix illisible : un objet est attendu.')
	const { scenario, identite } = valeur as { scenario?: unknown; identite?: unknown }
	if (!SCENARIOS.includes(scenario as Scenario))
		throw new ChoixRefuse(`Scénario inconnu. Les quatre scénarios : ${SCENARIOS.join(', ')}.`)
	if (typeof identite !== 'object' || identite === null) throw new ChoixRefuse('Choix illisible : aucune identité.')
	const { sub, email, nom, prenom, nomDeFamille, photo } = identite as Record<string, unknown>

	if (typeof email !== 'string' || !ADRESSE_FICTIVE.test(email))
		throw new ChoixRefuse(
			'Identité refusée : l’adresse doit être fictive, sous un domaine réservé en « .test », comme lea@example.test.'
		)
	if (typeof sub !== 'string' || !IDENTIFIANT.test(sub))
		throw new ChoixRefuse('Identité refusée : « sub » s’écrit en lettres, chiffres, « - » et « _ » (255 au plus).')
	return {
		scenario: scenario as Scenario,
		identite: {
			sub,
			email,
			nom: texte(nom, 'nom'),
			prenom: texte(prenom, 'prenom'),
			nomDeFamille: texte(nomDeFamille, 'nomDeFamille'),
			...(photo === undefined ? {} : { photo: photoFictive(photo) }),
		},
	}
}

/**
 * The full choice behind what a test asked for. Nothing asked: a verified address, and the
 * same made-up person every time.
 */
export function composerChoix(demande: Demande = {}): Choix {
	const { scenario = 'email-verifie', email = PAR_DEFAUT.email, photo } = demande
	const prenom = demande.prenom ?? PAR_DEFAUT.prenom
	const nomDeFamille = demande.nomDeFamille ?? PAR_DEFAUT.nomDeFamille
	return verifierChoix({
		scenario,
		identite: {
			sub: demande.sub ?? (typeof email === 'string' ? subDe(email) : ''),
			email,
			nom: demande.nom ?? `${prenom} ${nomDeFamille}`,
			prenom,
			nomDeFamille,
			...(photo === undefined ? {} : { photo }),
		},
	})
}

/** The choice as the value of a cookie. */
export const encoderChoix = (choix: Choix): string => Buffer.from(JSON.stringify(choix), 'utf8').toString('base64url')

/** The choice a cookie carries. Throws `ChoixRefuse` on anything `encoderChoix` did not write. */
export function decoderChoix(valeur: string): Choix {
	let lu: unknown
	try {
		lu = JSON.parse(Buffer.from(valeur, 'base64url').toString('utf8'))
	} catch {
		throw new ChoixRefuse(
			`Choix illisible : le cookie « ${COOKIE_DU_CHOIX} » n’est pas celui qu’écrit l’outil des tests.`
		)
	}
	return verifierChoix(lu)
}
