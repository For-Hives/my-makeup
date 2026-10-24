'use client'

import { useEffect, useState } from 'react'

/** What she reads once the address is on the clipboard. */
export const COPIED_TEXT = 'Lien copié'

/** What she reads when the browser refuses the copy: she can still select the address by hand. */
export const COPY_FAILURE_TEXT = 'Impossible de copier le lien : sélectionne-le et copie-le à la main.'

const BUTTON =
	'inline-flex min-h-11 items-center justify-center rounded-md border border-green-800 px-4 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-800'

/** The steps of « Ajouter le lien à ma bio Instagram », in the order she does them on her phone. */
export const INSTAGRAM_STEPS = [
	'Copie ton lien avec le bouton « Copier le lien » ci-dessus.',
	'Ouvre Instagram, va sur ton profil et appuie sur « Modifier le profil ».',
	'Appuie sur « Liens », puis sur « Ajouter un lien externe ».',
	'Colle ton lien, appuie sur « OK », puis enregistre.',
] as const

/**
 * The card « Ta page est en ligne ! » (ticket 306), shown by the page when her profile became publishable:
 * her address in clear, a button that copies it, a button that shares it through the share sheet of the
 * phone (only where the browser has one), and how to put it in her Instagram bio.
 *
 * The clipboard is a place a browser may refuse: the call is wrapped, and a failure is said. The
 * share sheet is looked for after the first render, so the server and the browser draw the same page.
 */
export function PageOnline({ adresse }: { adresse: string }) {
	const [status, setStatus] = useState('')
	const [canShare, setCanShare] = useState(false)

	useEffect(() => {
		try {
			setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
		} catch {
			setCanShare(false)
		}
	}, [])

	async function copy() {
		try {
			await navigator.clipboard.writeText(adresse)
			setStatus(COPIED_TEXT)
		} catch {
			setStatus(COPY_FAILURE_TEXT)
		}
	}

	async function share() {
		try {
			await navigator.share({ url: adresse, title: 'Ma page My Makeup' })
		} catch {
			// She closed the share sheet, or it is not available now: nothing to say.
		}
	}

	return (
		<section
			aria-labelledby="page-en-ligne-titre"
			data-testid="page-en-ligne"
			className="w-full min-w-0 rounded-[22px] border border-[#2F6B4F] bg-[#EAF4EE] p-5 text-[#1A1417] sm:p-6"
		>
			<h2 id="page-en-ligne-titre" className="font-bold text-neutral-800 text-xl">
				Ta page est en ligne !
			</h2>
			<p className="mt-2">Voici son adresse, à donner aux clientes :</p>
			<p data-testid="page-en-ligne-adresse" className="mt-2 break-all rounded-md bg-white p-3 font-medium">
				{adresse}
			</p>
			<div className="mt-3 flex flex-wrap gap-3">
				<button type="button" onClick={() => void copy()} className={`${BUTTON} bg-green-800 text-white`}>
					Copier le lien
				</button>
				{canShare ? (
					<button type="button" onClick={() => void share()} className={`${BUTTON} bg-white text-green-900`}>
						Partager
					</button>
				) : null}
			</div>
			<p role="status" data-testid="page-en-ligne-statut" className="mt-2 min-h-6 text-green-900 text-sm">
				{status}
			</p>
			<details className="mt-2">
				<summary className="inline-flex min-h-11 cursor-pointer items-center font-medium underline">
					Ajouter le lien à ma bio Instagram : comment faire
				</summary>
				<ol className="mt-2 list-decimal space-y-1 pl-6">
					{INSTAGRAM_STEPS.map(step => (
						<li key={step}>{step}</li>
					))}
				</ol>
			</details>
		</section>
	)
}
