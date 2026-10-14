'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import type { EtatDInscription } from '@/components/auth/FormulaireDInscription'
import { poserLeCookieDeSession } from '@/lib/auth/cookie-session'
import { freinDInscription } from '@/lib/auth/freins-inscription'
import { CHAMP_PIEGE, validerInscription } from '@/lib/auth/inscription'
import { inscrire } from '@/lib/auth/inscription-payload'
import { ipClient } from '@/lib/auth/ip-client'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { journalDe } from '@/lib/auth/journal'
import { journaliserUnRefus } from '@/lib/auth/refus-inscription'
import { PAGE_D_ACCUEIL_DU_COMPTE, PAGE_DU_MUR } from '@/lib/auth/retour'
import { envoiEmailDePayload } from '@/lib/emails/envoi'
import { serverEnv } from '@/lib/env'

const texte = (valeur: FormDataEntryValue | null): string => (typeof valeur === 'string' ? valeur : '')

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
export async function sInscrire(_precedent: EtatDInscription, formulaire: FormData): Promise<EtatDInscription> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { echec: 'service-indisponible' }

	const journal = journalDe(payload)
	const client = ipClient(entetes)
	const piege = formulaire.get(CHAMP_PIEGE)
	if (typeof piege === 'string' && piege.trim() !== '') {
		// A script. It is counted by the same brake so that a flood cannot fill the journal, and it is
		// shown the screen of a success, which it cannot tell from a real one.
		if (freinDInscription.prendre(client).autorise)
			await journaliserUnRefus(journal, client, 'inscription', 'champ-piege')
		redirect(PAGE_DU_MUR)
	}
	const saisie = {
		nom: formulaire.get('nom'),
		email: formulaire.get('email'),
		password: formulaire.get('password'),
		cgu: formulaire.get('cgu'),
	}
	const valeurs = { nom: texte(saisie.nom), email: texte(saisie.email), cgu: saisie.cgu === 'on' }
	const validation = validerInscription(saisie)
	if (!validation.ok) {
		await journaliserUnRefus(journal, client, 'inscription', 'donnees-invalides')
		return { erreurs: validation.erreurs, valeurs }
	}

	const place = freinDInscription.prendre(client)
	if (!place.autorise) {
		await journaliserUnRefus(journal, client, 'inscription', 'trop-de-tentatives')
		return { echec: 'trop-de-tentatives', valeurs }
	}

	const env = serverEnv()
	const site = process.env.NEXT_PUBLIC_SITE_URL ?? origine ?? 'http://localhost'
	const resultat = await inscrire({
		payload,
		donnees: validation.donnees,
		verifier: env.authVerify,
		envoyer: envoiEmailDePayload(payload, env),
		site,
		journal,
	})
	if (!resultat.ok) return { echec: resultat.code, valeurs }

	if (!resultat.confirmee) redirect(PAGE_DU_MUR)

	// Confirmation off: she is in. A refusal here is not the sign-up's to hide, but nothing is lost:
	// the account exists and she can sign in.
	const { token } = await ouvrirParMotDePasse(payload, 'pros', {
		email: validation.donnees.email,
		password: validation.donnees.password,
	}).catch(() => ({ token: undefined }))
	if (token) {
		await poserLeCookieDeSession(payload, token)
		redirect(PAGE_D_ACCUEIL_DU_COMPTE)
	}
	redirect('/auth/signin')
}
