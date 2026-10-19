'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import type { SignUpState } from '@/components/auth/SignUpForm'
import { setSessionCookie } from '@/lib/auth/set-session-cookie'
import { signUpRateLimit } from '@/lib/auth/sign-up-rate-limits'
import { TRAP_FIELD, validateSignUp } from '@/lib/auth/sign-up'
import { signUpAccount } from '@/lib/auth/sign-up-payload'
import { ipClient } from '@/lib/auth/client-ip'
import { openWithPassword } from '@/lib/auth/token'
import { authLog } from '@/lib/auth/auth-log'
import { logRefusal } from '@/lib/auth/sign-up-refusal'
import { ACCOUNT_ONBOARDING_PAGE, VERIFICATION_WALL_PAGE } from '@/lib/auth/return-to'
import { envoiEmailDePayload } from '@/lib/emails/envoi'
import { serverEnv } from '@/lib/env'

const text = (valeur: FormDataEntryValue | null): string => (typeof valeur === 'string' ? valeur : '')

/**
 * The sign-up form (ticket 082). The form is checked here with the same rules as in the page
 * (`validerInscription`), the account is made with her empty profile, and the confirmation mail
 * leaves in the same step (`inscrire`).
 *
 * - Confirmation on (the default, AUTH_VERIFY): she is sent to the wall of verification, signed out.
 *   She signs in once she has followed the link of the mail.
 * - Confirmation off (the operating switch): the account is confirmed at once, she is signed in and
 *   sent to the onboarding.
 *
 * Against the fake accounts (ticket 084), before any account is made:
 * - The trap field (`CHAMP_PIEGE`), hidden from every person, is filled by scripts only. Then she is
 *   shown the same success screen as anyone, nothing is created and no mail leaves.
 * - The brake by client address: 5 sign-ups an hour. A Server Action answers with the status of the
 *   framework, so the sixth attempt is stopped earlier, by the proxy, which answers 429 in French
 *   (`refus/route.ts`); the check here is the second line, with the code `trop-de-tentatives`.
 * - Refusals leave a row in the journal with their reason (never an address or an email), at most
 *   3 an hour for one client address and one reason (`journaliserUnRefus`).
 *
 * An address that already has an account (or a Gmail variant of one) gets the same wall as a new
 * one (ticket 083): `inscrire` tells the truth to the owner's mailbox only.
 *
 * As for the sign-in, the origin of the request is checked here as well as by Next.
 */
export async function signUp(_precedent: SignUpState, formulaire: FormData): Promise<SignUpState> {
	const payload = await getPayload({ config })
	const requestHeaders = await headers()
	const requestOrigin = requestHeaders.get('origin')
	if (requestOrigin !== null && !payload.config.csrf.includes(requestOrigin)) return { echec: 'service-indisponible' }

	const log = authLog(payload)
	const client = ipClient(requestHeaders)
	const trap = formulaire.get(TRAP_FIELD)
	if (typeof trap === 'string' && trap.trim() !== '') {
		// A script. It is counted by the same brake so that a flood cannot fill the journal, and it is
		// shown the screen of a success, which it cannot tell from a real one.
		if (signUpRateLimit.prendre(client).autorise) await logRefusal(log, client, 'sign-up', 'champ-piege')
		redirect(VERIFICATION_WALL_PAGE)
	}
	const input = {
		nom: formulaire.get('nom'),
		email: formulaire.get('email'),
		password: formulaire.get('password'),
		cgu: formulaire.get('cgu'),
	}
	const values = { nom: text(input.nom), email: text(input.email), cgu: input.cgu === 'on' }
	const validation = validateSignUp(input)
	if (!validation.ok) {
		await logRefusal(log, client, 'sign-up', 'donnees-invalides')
		return { erreurs: validation.erreurs, valeurs: values }
	}

	const place = signUpRateLimit.prendre(client)
	if (!place.autorise) {
		await logRefusal(log, client, 'sign-up', 'trop-de-tentatives')
		return { echec: 'trop-de-tentatives', valeurs: values }
	}

	const env = serverEnv()
	const site = process.env.NEXT_PUBLIC_SITE_URL ?? requestOrigin ?? 'http://localhost'
	const result = await signUpAccount({
		payload,
		donnees: validation.donnees,
		verifier: env.authVerify,
		envoyer: envoiEmailDePayload(payload, env),
		site,
		journal: log,
	})
	if (!result.ok)
		return result.code === 'email-invalide'
			? { erreurs: result.erreurs, valeurs: values }
			: { echec: result.code, valeurs: values }

	if (!result.confirmee) redirect(VERIFICATION_WALL_PAGE)

	// Confirmation off: she is in. A refusal here is not the sign-up's to hide, but nothing is lost:
	// the account exists and she can sign in.
	const { token } = await openWithPassword(payload, 'pros', {
		email: validation.donnees.email,
		password: validation.donnees.password,
	}).catch(() => ({ token: undefined }))
	if (token) {
		await setSessionCookie(payload, token)
		redirect(ACCOUNT_ONBOARDING_PAGE)
	}
	redirect('/auth/signin')
}
