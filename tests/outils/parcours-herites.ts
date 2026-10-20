import { expect } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { finishGoogleSignIn } from '@/lib/auth/google/google-sign-in'
import { type ConfigGoogle, discover, prepareStart } from '@/lib/auth/google/oidc'
import { replaceLegacyHash } from '@/lib/auth/legacy'
import { requestPasswordLink, resetPassword } from '@/lib/auth/password-reset-payload'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { payloadSendEmail } from '@/lib/emails/send'
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
const libre = () => createRateLimit({ nom: `essai-parcours-${n++}`, limite: 1000, fenetreMs: 60_000 })

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
	const resultat = await requestPasswordLink({
		payload,
		headers: adresseCliente(),
		email,
		envoyer: payloadSendEmail(payload, serverEnv()),
		site: SITE,
		apres: travail => {
			travaux.push(travail())
		},
		frein: libre(),
		journal: authLog(payload),
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
	return resetPassword({
		payload,
		headers: adresseCliente(),
		jeton,
		motDePasse,
		confirmation: motDePasse,
		frein: libre(),
		journal: authLog(payload),
	})
}

export async function seConnecter(email: string, password: string) {
	const payload = await payloadDeTest()
	return signInWithPassword({
		ouvrir: data => openWithPassword(payload, 'pros', data),
		herite: data => replaceLegacyHash(payload, data),
		headers: adresseCliente(),
		email,
		password,
		frein: libre(),
		journal: authLog(payload),
	})
}

/** One trip to the fake Google, from the departure to the end of the return. */
export async function connecterParGoogle(email: string) {
	const payload = await payloadDeTest()
	const config = configGoogle()
	const depart = prepareStart(config, await discover(config.emetteur), { retour: '/auth/profil', secret: SECRET })
	const retour = await fauxGoogle().autoriser(depart.adresse, fauxGoogle().choisir({ email }))
	return finishGoogleSignIn({
		payload,
		config,
		secret: SECRET,
		retour: {
			code: retour.searchParams.get('code'),
			state: retour.searchParams.get('state'),
			error: retour.searchParams.get('error'),
		},
		cookie: depart.cookie,
		journal: authLog(payload),
	})
}
