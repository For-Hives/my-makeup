'use client'

import { Button, useDocumentInfo, useField, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Two buttons at the top of the sheet of a profile (ticket 308): « Voir la page publique », and « Masquer… ».
 *
 * - The public page opens in a new tab, and only for a profile that is online: for the others the page answers
 *   404, so the sheet says why instead of offering a dead link.
 * - « Masquer… » asks first, then sets the choice of status to « masqué » in the form. Nothing is written before
 *   the sheet is saved: the same save as ever (ticket 166) takes the page down, and the server posts the status.
 */
export function ProfileActions() {
	const { id } = useDocumentInfo()
	const slug = useFormFields(([fields]) => fields.slug?.value)
	const status = useFormFields(([fields]) => fields.status?.value)
	const { value: choice, setValue: setChoice } = useField<string>({ path: 'chosenStatus' })
	const [asking, setAsking] = useState(false)
	const [said, setSaid] = useState('')

	if (id === undefined) return null
	const online = status === 'published' && typeof slug === 'string' && slug !== ''
	const hidden = choice === 'hidden'

	return (
		<div data-testid="profile-actions" style={{ marginBottom: 'var(--base)' }}>
			<div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--base) / 2)' }}>
				{online ? (
					<Button buttonStyle="secondary" el="anchor" newTab url={`/profil/${slug}`}>
						Voir la page publique
					</Button>
				) : null}
				{hidden ? (
					<Button
						buttonStyle="secondary"
						onClick={() => {
							setChoice('automatic')
							setSaid('Le profil sera republié à l’enregistrement, s’il est publiable.')
						}}
						type="button"
					>
						Republier
					</Button>
				) : (
					<Button buttonStyle="secondary" onClick={() => setAsking(true)} type="button">
						Masquer…
					</Button>
				)}
			</div>
			{asking && !hidden ? (
				<fieldset style={{ border: 0, margin: 'calc(var(--base) / 2) 0 0', maxWidth: '40rem', padding: 0 }}>
					<legend style={{ fontWeight: 600, padding: 0 }}>Masquer ce profil</legend>
					<p style={{ margin: '0 0 calc(var(--base) / 2)' }}>
						La page publique répondra 404 dès que tu enregistreras la fiche, et le profil quittera la recherche et le
						plan du site.
					</p>
					<div style={{ display: 'flex', gap: 'calc(var(--base) / 2)' }}>
						<Button
							buttonStyle="error"
							onClick={() => {
								setChoice('hidden')
								setAsking(false)
								setSaid('Statut choisi : masqué. Enregistre la fiche pour que la page publique disparaisse.')
							}}
							type="button"
						>
							Masquer le profil
						</Button>
						<Button
							buttonStyle="secondary"
							onClick={() => {
								setAsking(false)
								setSaid('')
							}}
							type="button"
						>
							Annuler
						</Button>
					</div>
				</fieldset>
			) : null}
			<p role="status" style={{ margin: 'calc(var(--base) / 2) 0 0' }}>
				{said}
			</p>
		</div>
	)
}
