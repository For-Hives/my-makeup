import type { CollectionBeforeChangeHook, Field, FieldAccess } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { neverAllowed, profileFieldAdminOrOwner } from '../../lib/access'
import { stateAfterSave } from '../../lib/profile/state'

/** Written by the server only, at every save: what any request sends on it is ignored. */
const COMPUTED: { create: FieldAccess; update: FieldAccess } = { create: neverAllowed, update: neverAllowed }

/** A flag of the state, read by everyone who reads the profile. */
const flag = (name: string, label: string, description: string): Field => ({
	name,
	label,
	type: 'checkbox',
	access: COMPUTED,
	admin: { readOnly: true, position: 'sidebar', description },
})

/** The date a flag took its current value, read by the owner and an admin only. */
const since = (name: string, label: string): Field => ({
	name,
	label,
	type: 'date',
	access: { read: profileFieldAdminOrOwner, ...COMPUTED },
	admin: {
		readOnly: true,
		position: 'sidebar',
		date: { pickerAppearance: 'dayAndTime' },
		description: 'Date à laquelle la case du dessus a pris sa valeur. Posée par le serveur.',
	},
})

/**
 * The state of a profile (ticket 044; docs/migration/SCHEMA.md §9), computed and stored by the
 * server at every save by the single rule (src/lib/profile/state.ts, which reads
 * src/lib/profile/completeness.ts): never written by an API, whatever a request sends.
 *
 * The score and the three flags are read by everyone who reads the profile: they say nothing a
 * reader does not see already (the phone and the email count only when shown), and the public
 * pages filter on them (noindex, sitemap, search). The dates are read by the owner and an admin.
 */
export const STATE_FIELDS: Field[] = [
	{
		name: 'completeness',
		label: 'Complétude',
		type: 'number',
		access: COMPUTED,
		admin: { readOnly: true, position: 'sidebar', description: 'Critères remplis, sur 13. Calculée par le serveur.' },
	},
	flag('active', 'Actif', 'Photo principale, ville et spécialité. Calculé par le serveur.'),
	since('activeSince', 'Actif ou non depuis le'),
	flag(
		'publishable',
		'Publiable',
		'Photo principale, ville, spécialité et un moyen de contact : visible dans la recherche. Calculé par le serveur.'
	),
	since('publishableSince', 'Publiable ou non depuis le'),
	flag(
		'indexable',
		'Indexable',
		'Publiable, avec une description de 100 caractères au moins et (une prestation chiffrée ou une photo de galerie) : la page entre dans le sitemap et Google peut la montrer. Calculé par le serveur.'
	),
	since('indexableSince', 'Indexable ou non depuis le'),
	flag(
		'fullyEmpty',
		'Entièrement vide',
		'Aucune des quatre conditions, ni prestation chiffrée, ni description de 100 caractères : le profil reste en brouillon. Calculé par le serveur.'
	),
	since('fullyEmptySince', 'Entièrement vide ou non depuis le'),
]

/**
 * Before a profile is written: its state, the dates of its flags and its status, by the rule of
 * src/lib/profile/state.ts, from what the save holds once the access rules have run (`data` holds
 * every field: Payload fills what a request leaves out with the stored value).
 */
export const stateBeforeWrite: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => ({
	...data,
	...stateAfterSave({
		avant: operation === 'update' ? originalDoc : undefined,
		apres: data,
		maintenant: new Date(),
	}),
})
