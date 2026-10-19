import { expect } from 'bun:test'
import { connecter } from '@/lib/auth/sign-in'
import { creerFrein } from '@/lib/auth/rate-limit'
import { terminerLaConnexionGoogle } from '@/lib/auth/google/google-sign-in'
import { type ConfigGoogle, decouvrir, preparerLeDepart } from '@/lib/auth/google/oidc'
import { remplacerLeHashHerite } from '@/lib/auth/legacy'
import { ouvrirParMotDePasse } from '@/lib/auth/token'
import { journalDe } from '@/lib/auth/auth-log'
import { demanderUnLien, reinitialiserLeMotDePasse } from '@/lib/auth/password-reset-payload'
import { envoiEmailDePayload } from '@/lib/emails/envoi'
import { serverEnv } from '@/lib/env'
import { fauxGoogle } from './faux-google'
import { attendreLeMail } from './mailpit'
import { payloadDeTest } from './payload-test'

/**
 * The three ways into an account of the old site, as the tests of tickets 093 and 095 play them
 * without a browser: the password chosen through « Mot de passe oublié » (link read in the mail
 * catcher), the sign-in by password (with the old-hash path), and the sign-in by the fake Google.
 * Each call takes its own client address and its own brake, so that no test is slowed by another.
 */

export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? ''
export const SECRET = process.env.PAYLOAD_SECRET ?? ''
/** The password a test chooses for an account that had none. */
export const CHOIX = 'mot-de-passe-choisi-fictif'

let n = 0
const adresseCliente = () => new Headers({ 'x-forwarded-for': `203.0.113.${1 + (n++ % 250)}` })
const libre = () => creerFrein({ nom: `essai-parcours-${n++}`, limite: 1000, fenetreMs: 60_000 })

export const configGoogle = (): ConfigGoogle => {
	const google = fauxGoogle()
	return {
		emetteur: google.emetteur,
		clientId: google.clientId,
		clientSecret: google.secret,
		redirectUri: `${SITE}/auth/google/callback`,
	}
}

/** Asks for the link, waits for the mail, and gives the token of its link. */
export async function demanderLeLien(email: string): Promise<string> {
	const payload = await payloadDeTest()
	const travaux: Promise<void>[] = []
	const resultat = await demanderUnLien({
		payload,
		headers: adresseCliente(),
		email,
		envoyer: envoiEmailDePayload(payload, serverEnv()),
		site: SITE,
		apres: travail => {
			travaux.push(travail())
		},
		frein: libre(),
		journal: journalDe(payload),
	})
	expect(resultat).toEqual({ ok: true })
	await Promise.all(travaux)
	const mail = await attendreLeMail({ pour: email, sujet: /Réinitialise ton mot de passe/ })
	const lien = mail.liens.find(l => new URL(l).pathname === '/auth/reinitialiser')
	if (!lien) throw new Error('Le mail ne porte pas le lien.')
	return new URL(lien).searchParams.get('code') ?? ''
}

export async function choisirUnMotDePasse(jeton: string, motDePasse: string = CHOIX) {
	const payload = await payloadDeTest()
	return reinitialiserLeMotDePasse({
		payload,
		headers: adresseCliente(),
		jeton,
		motDePasse,
		confirmation: motDePasse,
		frein: libre(),
		journal: journalDe(payload),
	})
}

export async function seConnecter(email: string, password: string) {
	const payload = await payloadDeTest()
	return connecter({
		ouvrir: data => ouvrirParMotDePasse(payload, 'pros', data),
		herite: data => remplacerLeHashHerite(payload, data),
		headers: adresseCliente(),
		email,
		password,
		frein: libre(),
		journal: journalDe(payload),
	})
}

/** One trip to the fake Google, from the departure to the end of the return. */
export async function connecterParGoogle(email: string) {
	const payload = await payloadDeTest()
	const config = configGoogle()
	const depart = preparerLeDepart(config, await decouvrir(config.emetteur), { retour: '/auth/profil', secret: SECRET })
	const retour = await fauxGoogle().autoriser(depart.adresse, fauxGoogle().choisir({ email }))
	return terminerLaConnexionGoogle({
		payload,
		config,
		secret: SECRET,
		retour: {
			code: retour.searchParams.get('code'),
			state: retour.searchParams.get('state'),
			error: retour.searchParams.get('error'),
		},
		cookie: depart.cookie,
		journal: journalDe(payload),
	})
}
