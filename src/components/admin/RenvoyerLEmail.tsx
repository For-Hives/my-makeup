'use client'

import { Button, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

/**
 * The button « Renvoyer l'email » of a contact message in the admin panel (ticket 163). It shows only
 * when the mail to the team failed. One click sends once: the button is taken at once (a double click
 * never reaches the server twice), and the server takes the message before it sends, so a second tab
 * sends nothing either. The result is written under the button.
 */

type Phase = 'repos' | 'envoi' | 'envoye' | 'echec' | 'deja'

const PHRASES: Record<Exclude<Phase, 'repos' | 'envoi'>, string> = {
	envoye: 'L’email a été renvoyé à l’équipe.',
	echec:
		'L’email n’a pas pu partir. Le message est gardé. Si l’équipe ne l’a pas reçu dans quelques minutes, tu peux le renvoyer.',
	deja: 'Cet email n’est plus en échec : il est déjà parti, ou un autre envoi est en cours.',
}

export function RenvoyerLEmail() {
	const { id } = useDocumentInfo()
	const etatMail = useFormFields(([champs]) => champs.etatMail?.value)
	const router = useRouter()
	const pris = useRef(false)
	const [phase, setPhase] = useState<Phase>('repos')

	if (id === undefined) return null
	// After a result, the panel keeps the answer on screen even though the state has changed under it.
	if (etatMail !== 'echec' && phase === 'repos') return null

	async function renvoyer() {
		if (pris.current) return
		pris.current = true
		setPhase('envoi')
		try {
			const reponse = await fetch(`/api/demandes/${id}/resend`, { method: 'POST', credentials: 'same-origin' })
			if (reponse.status === 409) setPhase('deja')
			else if (!reponse.ok) setPhase('echec')
			else setPhase(((await reponse.json()) as { etatMail?: string }).etatMail === 'envoye' ? 'envoye' : 'echec')
		} catch {
			setPhase('echec')
		}
		pris.current = false
		router.refresh()
	}

	const enCours = phase === 'envoi'
	return (
		<div style={{ marginBottom: 'var(--base)' }}>
			<Button
				buttonStyle="secondary"
				disabled={enCours || phase === 'envoye' || phase === 'deja'}
				onClick={() => void renvoyer()}
				type="button"
			>
				{enCours ? 'Envoi en cours…' : 'Renvoyer l’email'}
			</Button>
			<p data-testid="resultat-du-renvoi" role="status" style={{ margin: 'calc(var(--base) / 2) 0 0' }}>
				{phase === 'repos' || phase === 'envoi' ? '' : PHRASES[phase]}
			</p>
		</div>
	)
}
