'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import type { EtatDInscription } from '@/components/auth/FormulaireDInscription'
import { poserLeCookieDeSession } from '@/lib/auth/cookie-session'
import { validerInscription } from '@/lib/auth/inscription'
import { inscrire } from '@/lib/auth/inscription-payload'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { journalDe } from '@/lib/auth/journal'
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
 * As for the sign-in, the origin of the request is checked here as well as by Next.
 */
export async function sInscrire(_precedent: EtatDInscription, formulaire: FormData): Promise<EtatDInscription> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { echec: 'service-indisponible' }

	const journal = journalDe(payload)
	const saisie = {
		nom: formulaire.get('nom'),
		email: formulaire.get('email'),
		password: formulaire.get('password'),
		cgu: formulaire.get('cgu'),
	}
	const valeurs = { nom: texte(saisie.nom), email: texte(saisie.email), cgu: saisie.cgu === 'on' }
	const validation = validerInscription(saisie)
	if (!validation.ok) {
		await journal({ type: 'inscription', code: 'donnees-invalides' })
		return { erreurs: validation.erreurs, valeurs }
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
