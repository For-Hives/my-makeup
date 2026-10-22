'use client'

import { Button, useFormFields } from '@payloadcms/ui'
import { replyMailto } from '../../lib/contact/reply'

/**
 * The button « Répondre par email » of a contact message in the admin panel (ticket 308). It is a link
 * `mailto:` with the address of the visitor and the subject « Re : votre message à My Makeup »: the message
 * itself is never copied into it. Opening it changes nothing in the base: the status « Répondue » is the
 * team's to set once the answer has left.
 */
export function ReplyByEmail() {
	const email = useFormFields(([fields]) => fields.email?.value)
	const link = replyMailto(email)
	if (link === null) return null
	return (
		<div data-testid="reply-by-email" style={{ marginBottom: 'var(--base)' }}>
			<Button buttonStyle="primary" el="anchor" url={link}>
				Répondre par email
			</Button>
			<p style={{ margin: 'calc(var(--base) / 2) 0 0' }}>
				Une fois ta réponse envoyée, passe le message à « Répondue » dans le statut.
			</p>
		</div>
	)
}
