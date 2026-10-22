'use client'

import { Button, useDocumentInfo, useFormFields, useFormModified } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { reviewButtons, zoneReviewView } from '../../lib/dashboard/zone-review'

/**
 * The communes of a zone to review, as buttons « Choisir <commune> » (ticket 308), in place of the JSON the
 * import wrote. A click asks the server to save that commune (POST /api/profiles/:id/choose-city): it is the
 * choice the makeup artist makes herself, and the server refuses a commune that is not in the list. The
 * review is emptied by the save, so the buttons disappear.
 *
 * The page is read again after a choice: with unsaved changes in the form, the buttons wait for the save.
 */
export function ZoneCandidates() {
	const { id } = useDocumentInfo()
	const router = useRouter()
	const modified = useFormModified()
	const reason = useFormFields(([fields]) => fields['zoneReview.reason']?.value)
	const postalCode = useFormFields(([fields]) => fields['zoneReview.postalCode']?.value)
	const candidates = useFormFields(([fields]) => fields['zoneReview.candidates']?.value)
	const taken = useRef(false)
	const [message, setMessage] = useState('')

	const view = zoneReviewView({ reason, postalCode, candidates })
	const buttons = view === null ? [] : reviewButtons(view)
	if (id === undefined || buttons.length === 0) return null

	async function choose(inseeCode: string, label: string) {
		if (taken.current) return
		taken.current = true
		setMessage('')
		try {
			const response = await fetch(`/api/profiles/${id}/choose-city`, {
				body: JSON.stringify({ inseeCode }),
				credentials: 'same-origin',
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			})
			if (response.ok) {
				setMessage(`Commune enregistrée : ${label}.`)
				router.refresh()
			} else {
				const body = (await response.json().catch(() => null)) as { message?: unknown } | null
				setMessage(typeof body?.message === 'string' ? body.message : 'La commune n’a pas pu être enregistrée.')
			}
		} catch {
			setMessage('La commune n’a pas pu être enregistrée.')
		}
		taken.current = false
	}

	return (
		<div data-testid="zone-candidates" style={{ marginBottom: 'var(--base)' }}>
			<h4 style={{ margin: '0 0 calc(var(--base) / 2)' }}>Communes possibles</h4>
			<p style={{ margin: '0 0 calc(var(--base) / 2)' }}>
				{view?.codePostal !== null
					? `Le code postal ${view?.codePostal} couvre ${buttons.length} commune${buttons.length > 1 ? 's' : ''}. Choisis celle de la maquilleuse.`
					: 'Choisis la commune de la maquilleuse.'}
			</p>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--base) / 2)' }}>
				{buttons.map(({ codeInsee, libelle }) => (
					<Button
						buttonStyle="secondary"
						disabled={modified}
						key={codeInsee}
						onClick={() => void choose(codeInsee, libelle)}
						type="button"
					>
						Choisir {libelle}
					</Button>
				))}
			</div>
			{modified ? (
				<p style={{ margin: 'calc(var(--base) / 2) 0 0' }}>Enregistre d’abord tes modifications pour choisir.</p>
			) : null}
			<p role="status" style={{ margin: 'calc(var(--base) / 2) 0 0' }}>
				{message}
			</p>
		</div>
	)
}
