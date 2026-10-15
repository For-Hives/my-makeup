import { type CollectionBeforeChangeHook, type CollectionConfig, ValidationError } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { adminSeulement, estAdmin, jamais } from '../lib/acces'
import {
	ETATS_DU_MAIL,
	estUnStatutDeDemande,
	STATUTS_DE_DEMANDE,
	TYPES_DE_DEMANDE,
	transitionPermise,
} from '../lib/contact/etats'
import { LIMITES_DU_CONTACT } from '../lib/contact/message'
import { renvoyerLEmail } from '../lib/contact/renvoi-route'

const LIBELLES_DES_TYPES: Record<(typeof TYPES_DE_DEMANDE)[number], string> = { contact: 'Message de contact' }

const LIBELLES_DES_STATUTS: Record<(typeof STATUTS_DE_DEMANDE)[number], string> = {
	nouvelle: 'Nouvelle',
	transmise: 'Transmise à l’équipe',
	repondue: 'Répondue',
	spam: 'Spam',
}

const LIBELLES_DES_ETATS_DU_MAIL: Record<(typeof ETATS_DU_MAIL)[number], string> = {
	'en-attente': 'En cours d’envoi',
	envoye: 'Envoyé',
	echec: 'Échec de l’envoi',
}

/**
 * The cycle of the status (src/lib/contact/etats.ts, plan 02 U78), kept by the collection itself.
 * - An admin who asks for a move the cycle does not allow gets a sentence in French, and nothing changes.
 * - The server (no account on the request) only ever moves `nouvelle` to `transmise`, once the mail has left.
 *   A late « the mail left » that arrives after an admin marked the message answered or spam changes nothing
 *   of its status.
 */
const garderLeCycle: CollectionBeforeChangeHook = ({ data: recu, originalDoc, operation, req }) => {
	if (operation !== 'update' || !originalDoc) return recu
	// The date of reception is the server's: the retention purge keys on it, so no request rewrites it.
	const data = { ...recu }
	if (req.user) {
		if (originalDoc.createdAt === undefined) delete data.createdAt
		else data.createdAt = originalDoc.createdAt
	}
	const de: unknown = originalDoc.statut
	const vers: unknown = data.statut
	if (!estUnStatutDeDemande(de) || !estUnStatutDeDemande(vers) || de === vers) return data
	if (req.user) {
		if (!transitionPermise(de, vers))
			throw new ValidationError({
				errors: [
					{
						path: 'statut',
						message: `Un message « ${LIBELLES_DES_STATUTS[de]} » ne peut pas passer à « ${LIBELLES_DES_STATUTS[vers]} ».`,
					},
				],
			})
		// `transmise` is the server's word for « the mail left »: an admin cannot say it while it did not.
		if (vers === 'transmise' && originalDoc.etatMail !== 'envoye')
			throw new ValidationError({
				errors: [
					{
						path: 'statut',
						message:
							'Le message n’est « Transmis à l’équipe » que lorsque son email est parti. Renvoie l’email, ou marque le message « Répondu ».',
					},
				],
			})
		return data
	}
	return vers === 'transmise' && de !== 'nouvelle' ? { ...data, statut: de } : data
}

/** Everything but the status is what the visitor typed, or what the server wrote: no request changes it. */
const figee = { update: jamais }

/**
 * The messages sent through the contact form (tickets 158 and 159; plan 01 §5 P8; docs/migration/SCHEMA.md).
 *
 * - The server stores the message first, then sends the mail to the team: a mail that does not leave
 *   never loses the message (`etatMail` is then `echec`).
 * - Only an admin reads it. Nobody creates or deletes it through an API, an admin included: the server
 *   writes it, through the Local API. A visitor has no account, so the form cannot be an API call of hers.
 *   An admin changes its status (answered, spam) and nothing else: every other field is frozen. The rules
 *   stay active everywhere else, and the matrix of access plays this collection for every role.
 * - Ticket 163: the admin list filters the messages whose mail failed, and the button « Renvoyer l'email »
 *   of the message sends it again (src/lib/contact/renvoi.ts), once however many times it is clicked.
 * - It holds what the visitor typed, so it is never in a log, a mail subject or a measure event.
 */
export const Demandes: CollectionConfig<'demandes'> = {
	slug: 'demandes',
	labels: { singular: 'Message de contact', plural: 'Messages de contact' },
	admin: {
		defaultColumns: ['createdAt', 'type', 'statut', 'etatMail', 'prenom', 'nom'],
		hidden: ({ user }) => !estAdmin(user as Parameters<typeof estAdmin>[0]),
		useAsTitle: 'nom',
		components: { beforeListTable: ['/components/admin/EchecsDEnvoi#EchecsDEnvoi'] },
	},
	endpoints: [renvoyerLEmail],
	hooks: { beforeChange: [garderLeCycle] },
	defaultSort: '-createdAt',
	access: {
		read: adminSeulement,
		create: () => false,
		update: adminSeulement,
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
			access: figee,
			options: TYPES_DE_DEMANDE.map(type => ({ label: LIBELLES_DES_TYPES[type], value: type })),
		},
		{
			name: 'statut',
			label: 'Statut',
			type: 'select',
			required: true,
			defaultValue: 'nouvelle',
			index: true,
			options: STATUTS_DE_DEMANDE.map(statut => ({ label: LIBELLES_DES_STATUTS[statut], value: statut })),
			admin: {
				description:
					'Passe le message à « Répondue » quand tu as répondu à la personne, ou à « Spam » si ce n’est pas un vrai message.',
			},
		},
		{
			name: 'etatMail',
			label: 'Email à l’équipe',
			type: 'select',
			required: true,
			defaultValue: 'en-attente',
			index: true,
			access: figee,
			options: ETATS_DU_MAIL.map(etat => ({ label: LIBELLES_DES_ETATS_DU_MAIL[etat], value: etat })),
		},
		{
			name: 'prenom',
			label: 'Prénom',
			type: 'text',
			required: true,
			maxLength: LIMITES_DU_CONTACT.prenom,
			access: figee,
		},
		{ name: 'nom', label: 'Nom', type: 'text', required: true, maxLength: LIMITES_DU_CONTACT.nom, access: figee },
		{ name: 'email', label: 'Email', type: 'text', required: true, maxLength: LIMITES_DU_CONTACT.email, access: figee },
		{
			name: 'telephone',
			label: 'Numéro de téléphone',
			type: 'text',
			required: true,
			maxLength: LIMITES_DU_CONTACT.telephone,
			access: figee,
		},
		{
			name: 'message',
			label: 'Message',
			type: 'textarea',
			required: true,
			maxLength: LIMITES_DU_CONTACT.message,
			access: figee,
		},
		{
			name: 'renvoi',
			type: 'ui',
			admin: { components: { Field: '/components/admin/RenvoyerLEmail#RenvoyerLEmail' } },
		},
	],
}
