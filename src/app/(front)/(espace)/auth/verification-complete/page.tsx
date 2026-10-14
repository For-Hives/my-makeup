import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'
import { confirmerLEmail, type ResultatDeConfirmation } from '@/lib/auth/confirmation'
import { journalDe } from '@/lib/auth/journal'
import { PAGE_D_ACCUEIL_DU_COMPTE } from '@/lib/auth/retour'

// Read per request: it confirms an account, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Confirmation de ton adresse email',
	description: 'Ton adresse email est confirmée : tu peux te connecter à My Makeup.',
}

const TITRES: Record<ResultatDeConfirmation, string> = {
	ok: 'Félicitations ! Ton compte My Makeup est maintenant activé !',
	'deja-confirme': 'Ton adresse email est déjà confirmée.',
	'lien-invalide': 'Ce lien de confirmation n’est pas valide.',
}

const TEXTES: Record<ResultatDeConfirmation, string> = {
	ok: 'Tu peux désormais te connecter.',
	'deja-confirme': 'Ton compte est actif : tu peux te connecter.',
	'lien-invalide': 'Il est peut-être incomplet. Reprends le lien depuis le mail de confirmation.',
}

// Following the link of the mail confirms the account (ticket 082). The same link followed again says
// it is already done.
export default async function ConfirmationDeLEmail({
	searchParams,
}: {
	searchParams: Promise<{ code?: string | string[] }>
}) {
	const { code } = await searchParams
	const payload = await getPayload({ config })
	const resultat = await confirmerLEmail(payload, code, journalDe(payload))
	const connexion = `/auth/signin?callbackUrl=${encodeURIComponent(PAGE_D_ACCUEIL_DU_COMPTE)}`

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="max-w-md font-semibold text-3xl">{TITRES[resultat]}</h1>
			<p className="max-w-sm text-neutral-700">{TEXTES[resultat]}</p>
			<p>
				<Link
					className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
					href={resultat === 'lien-invalide' ? '/auth/signin' : connexion}
				>
					Se connecter
				</Link>
			</p>
		</main>
	)
}
