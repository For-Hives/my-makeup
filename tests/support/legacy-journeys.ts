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
import { fakeGoogle } from './fake-google'
import { waitMail } from './mailpit'
import { testPayload } from './payload-test'

/**
 * The three ways into an account of the old site, as the tests of tickets 093 and 095 play them
 * without a browser: the password chosen through « Mot de passe oublié » (link read in the mail
 * catcher), the sign-in by password (with the old-hash path), and the sign-in by the fake Google.
 * Each call takes its own client address and its own brake, so that no test is slowed by another.
 */

export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? ''
export const SECRET = process.env.PAYLOAD_SECRET ?? ''
/** The password a test chooses for an account that had none. */
export const CHOICE = 'mot-de-passe-choisi-fictif'

let n = 0
const urlClient = () => new Headers({ 'x-forwarded-for': `203.0.113.${1 + (n++ % 250)}` })
const free = () => createRateLimit({ nom: `essai-parcours-${n++}`, limite: 1000, fenetreMs: 60_000 })

export const configGoogle = (): ConfigGoogle => {
	const google = fakeGoogle()
	return {
		emetteur: google.emetteur,
		clientId: google.clientId,
		clientSecret: google.secret,
		redirectUri: `${SITE}/auth/google/callback`,
	}
}

/** Asks for the link, waits for the mail, and gives the token of its link. */
export async function requestLink(email: string): Promise<string> {
	const payload = await testPayload()
	const jobs: Promise<void>[] = []
	const result = await requestPasswordLink({
		payload,
		headers: urlClient(),
		email,
		envoyer: payloadSendEmail(payload, serverEnv()),
		site: SITE,
		apres: travail => {
			jobs.push(travail())
		},
		frein: free(),
		journal: authLog(payload),
	})
	expect(result).toEqual({ ok: true })
	await Promise.all(jobs)
	const mail = await waitMail({ pour: email, sujet: /Réinitialise ton mot de passe/ })
	const link = mail.liens.find(l => new URL(l).pathname === '/auth/reinitialiser')
	if (!link) throw new Error('Le mail ne porte pas le lien.')
	return new URL(link).searchParams.get('code') ?? ''
}

export async function pickPassword(jeton: string, motDePasse: string = CHOICE) {
	const payload = await testPayload()
	return resetPassword({
		payload,
		headers: urlClient(),
		jeton,
		motDePasse,
		confirmation: motDePasse,
		frein: free(),
		journal: authLog(payload),
	})
}

export async function connect(email: string, password: string) {
	const payload = await testPayload()
	return signInWithPassword({
		ouvrir: data => openWithPassword(payload, 'pros', data),
		herite: data => replaceLegacyHash(payload, data),
		headers: urlClient(),
		email,
		password,
		frein: free(),
		journal: authLog(payload),
	})
}

/** One trip to the fake Google, from the departure to the end of the return. */
export async function connectByGoogle(email: string) {
	const payload = await testPayload()
	const config = configGoogle()
	const start = prepareStart(config, await discover(config.emetteur), { retour: '/auth/profil', secret: SECRET })
	const returnUrl = await fakeGoogle().autoriser(start.adresse, fakeGoogle().choisir({ email }))
	return finishGoogleSignIn({
		payload,
		config,
		secret: SECRET,
		retour: {
			code: returnUrl.searchParams.get('code'),
			state: returnUrl.searchParams.get('state'),
			error: returnUrl.searchParams.get('error'),
		},
		cookie: start.cookie,
		journal: authLog(payload),
	})
}
