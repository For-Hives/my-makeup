import { type CollectionBeforeChangeHook, type CollectionConfig, ValidationError } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminOnly, hiddenExceptAdmin, neverAllowed } from '../lib/access'
import { CONTACT_LIMITS } from '../lib/contact/message'
import { resendEmail } from '../lib/contact/resend-route'
import { isRequestStatus, MAIL_STATES, REQUEST_STATUSES, REQUEST_TYPES, transitionAllowed } from '../lib/contact/states'

const TYPE_LABELS: Record<(typeof REQUEST_TYPES)[number], string> = { contact: 'Message de contact' }

const STATUS_LABELS: Record<(typeof REQUEST_STATUSES)[number], string> = {
	new: 'Nouvelle',
	forwarded: 'Transmise à l’équipe',
	answered: 'Répondue',
	spam: 'Spam',
}

const MAIL_STATUS_LABELS: Record<(typeof MAIL_STATES)[number], string> = {
	pending: 'En cours d’envoi',
	sent: 'Envoyé',
	failed: 'Échec de l’envoi',
}

/**
 * The cycle of the status (src/lib/contact/states.ts, plan 02 U78), kept by the collection itself.
 * - An admin who asks for a move the cycle does not allow gets a sentence in French, and nothing changes.
 * - The server (no account on the request) only ever moves `new` to `forwarded`, once the mail has left.
 *   A late « the mail left » that arrives after an admin marked the message answered or spam changes nothing
 *   of its status.
 */
const keepTheCycle: CollectionBeforeChangeHook = ({ data: recu, originalDoc, operation, req }) => {
	if (operation !== 'update' || !originalDoc) return recu
	// The date of reception is the server's: the retention purge keys on it, so no request rewrites it.
	const data = { ...recu }
	if (req.user) {
		if (originalDoc.createdAt === undefined) delete data.createdAt
		else data.createdAt = originalDoc.createdAt
	}
	const previousStatus: unknown = originalDoc.status
	const nextStatus: unknown = data.status
	if (!isRequestStatus(previousStatus) || !isRequestStatus(nextStatus) || previousStatus === nextStatus) return data
	if (req.user) {
		if (!transitionAllowed(previousStatus, nextStatus))
			throw new ValidationError({
				errors: [
					{
						path: 'status',
						message: `Un message « ${STATUS_LABELS[previousStatus]} » ne peut pas passer à « ${STATUS_LABELS[nextStatus]} ».`,
					},
				],
			})
		// `forwarded` is the server's word for « the mail left »: an admin cannot say it while it did not.
		if (nextStatus === 'forwarded' && originalDoc.mailStatus !== 'sent')
			throw new ValidationError({
				errors: [
					{
						path: 'status',
						message:
							'Le message n’est « Transmis à l’équipe » que lorsque son email est parti. Renvoie l’email, ou marque le message « Répondu ».',
					},
				],
			})
		return data
	}
	return nextStatus === 'forwarded' && previousStatus !== 'new' ? { ...data, status: previousStatus } : data
}

/** Everything but the status is what the visitor typed, or what the server wrote: no request changes it. */
const frozen = { update: neverAllowed }

/**
 * The messages sent through the contact form (tickets 158 and 159; plan 01 §5 P8; docs/migration/SCHEMA.md).
 *
 * - The server stores the message first, then sends the mail to the team: a mail that does not leave
 *   never loses the message (`mailStatus` is then `failed`).
 * - Only an admin reads it. Nobody creates or deletes it through an API, an admin included: the server
 *   writes it, through the Local API. A visitor has no account, so the form cannot be an API call of hers.
 *   An admin changes its status (answered, spam) and nothing else: every other field is frozen. The rules
 *   stay active everywhere else, and the matrix of access plays this collection for every role.
 * - Ticket 163: the admin list filters the messages whose mail failed, and the button « Renvoyer l'email »
 *   of the message sends it again (src/lib/contact/resend.ts), once however many times it is clicked.
 * - It holds what the visitor typed, so it is never in a log, a mail subject or a measure event.
 */
export const ContactRequests: CollectionConfig<'contact-requests'> = {
	slug: 'contact-requests',
	labels: { singular: 'Message de contact', plural: 'Messages de contact' },
	admin: {
		defaultColumns: ['createdAt', 'type', 'status', 'mailStatus', 'firstName', 'lastName'],
		hidden: hiddenExceptAdmin,
		useAsTitle: 'lastName',
		components: { beforeListTable: ['/components/admin/SendFailures#SendFailures'] },
	},
	endpoints: [resendEmail],
	hooks: { beforeChange: [keepTheCycle] },
	defaultSort: '-createdAt',
	access: {
		read: adminOnly,
		create: () => false,
		update: adminOnly,
		delete: () => false,
	},
	fields: [
		{
			name: 'type',
			label: 'Type',
			type: 'select',
			required: true,
			defaultValue: 'contact',
			index: true,
			access: frozen,
			options: REQUEST_TYPES.map(type => ({ label: TYPE_LABELS[type], value: type })),
		},
		{
			name: 'status',
			label: 'Statut',
			type: 'select',
			required: true,
			defaultValue: 'new',
			index: true,
			options: REQUEST_STATUSES.map(statut => ({ label: STATUS_LABELS[statut], value: statut })),
			admin: {
				description:
					'Passe le message à « Répondue » quand tu as répondu à la personne, ou à « Spam » si ce n’est pas un vrai message.',
			},
		},
		{
			name: 'mailStatus',
			label: 'Email à l’équipe',
			type: 'select',
			required: true,
			defaultValue: 'pending',
			index: true,
			access: frozen,
			options: MAIL_STATES.map(etat => ({ label: MAIL_STATUS_LABELS[etat], value: etat })),
		},
		{
			name: 'firstName',
			label: 'Prénom',
			type: 'text',
			required: true,
			maxLength: CONTACT_LIMITS.prenom,
			access: frozen,
		},
		{ name: 'lastName', label: 'Nom', type: 'text', required: true, maxLength: CONTACT_LIMITS.nom, access: frozen },
		{
			name: 'email',
			label: 'Email',
			type: 'text',
			required: true,
			maxLength: CONTACT_LIMITS.email,
			access: frozen,
		},
		{
			name: 'phone',
			label: 'Numéro de téléphone',
			type: 'text',
			// Optional since ticket 305: the form sends the message without it.
			maxLength: CONTACT_LIMITS.telephone,
			access: frozen,
		},
		{
			name: 'message',
			label: 'Message',
			type: 'textarea',
			required: true,
			maxLength: CONTACT_LIMITS.message,
			access: frozen,
		},
		// Ticket 308: « Répondre par email », a link `mailto:` with the address and the subject only.
		{
			name: 'reply',
			type: 'ui',
			admin: { components: { Field: '/components/admin/ReplyByEmail#ReplyByEmail' } },
		},
		{
			name: 'resend',
			type: 'ui',
			admin: { components: { Field: '/components/admin/ResendEmail#ResendEmail' } },
		},
	],
}
