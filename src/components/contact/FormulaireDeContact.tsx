'use client'

import { type ReactNode, useActionState, useEffect, useMemo, useRef } from 'react'
import { track } from '@/lib/analytics/track'
import {
	type ChampDuContact,
	type EtatDuContact,
	MESSAGE_ENVOYE,
	MESSAGE_NON_ENREGISTRE,
	RESUME_DES_ERREURS,
} from '@/lib/contact/message'

export type ActionDuContact = (precedent: EtatDuContact, formulaire: FormData) => Promise<EtatDuContact>

/** What the form needs of the measure: `track`, and a double in a test. */
export type SuivreLeContact = (nom: 'platform_contact_submit', proprietes: { ok: boolean; status: number }) => unknown

const CHAMP =
	'block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-600 sm:text-sm sm:leading-6'

const LIBELLES: Record<ChampDuContact, string> = {
	prenom: 'Prénom',
	nom: 'Nom',
	email: 'Email',
	telephone: 'Numéro de téléphone',
	message: 'Message',
}

/** The outcome of one send, as the event counts it: stored or not, and an HTTP-like status. Never what was typed. */
function issue(etat: Exclude<EtatDuContact, null>): { ok: boolean; status: number } {
	if ('envoye' in etat) return { ok: true, status: 200 }
	if ('erreurs' in etat) return { ok: false, status: 400 }
	return { ok: false, status: etat.reseau ? 0 : 500 }
}

/**
 * A request that fails on the way (the network, a proxy) throws in the client script of Next: it is turned
 * into the state of a failure, so that the form keeps what she typed and says so.
 */
export function avecLEchecDuReseau(action: ActionDuContact): ActionDuContact {
	return async (precedent, formulaire) => {
		try {
			return await action(precedent, formulaire)
		} catch {
			const texte = (cle: ChampDuContact) => {
				const valeur = formulaire.get(cle)
				return typeof valeur === 'string' ? valeur : ''
			}
			return {
				echec: true,
				reseau: true,
				valeurs: {
					prenom: texte('prenom'),
					nom: texte('nom'),
					email: texte('email'),
					telephone: texte('telephone'),
					message: texte('message'),
				},
			}
		}
	}
}

/** One field: its label, the control, and the sentence of its error. */
function Champ({
	champ,
	large = true,
	erreur,
	children,
}: {
	champ: ChampDuContact
	large?: boolean
	erreur: string | undefined
	children: ReactNode
}) {
	return (
		<div className={large ? 'sm:col-span-2' : undefined}>
			<label htmlFor={champ} className="block font-semibold text-gray-900 text-sm leading-6">
				{LIBELLES[champ]}
			</label>
			<div className="mt-2.5">
				{children}
				<p id={`erreur-${champ}`} data-testid={`erreur-${champ}`} className="mt-2 text-red-700 text-xs">
					{erreur}
				</p>
			</div>
		</div>
	)
}

/**
 * The contact form (ticket 158; tickets 159 and 160 for what it does when it fails).
 *
 * - The page does not block the submit: the server checks the same rules and answers one sentence per
 *   field, shown under the field, so that the wording is the same with or without scripts.
 * - On an error, the focus goes to the first field in error and the summary is announced. Each field
 *   points to its sentence (`aria-describedby`) and is marked invalid.
 * - A double click or an Enter held down sends one message: the form refuses a second submit until the
 *   answer is there, and the button is off meanwhile. Once sent, the form gives way to the confirmation.
 * - After a failure, what she typed stays in the fields. React empties a form once its action has
 *   answered, so the fields are remounted with each answer and take her typing back as their value.
 * - The event of the measure is sent once for each answer.
 */
export function FormulaireDeContact({ action, suivre = track }: { action: ActionDuContact; suivre?: SuivreLeContact }) {
	const [etat, envoyer, enCours] = useActionState(avecLEchecDuReseau(action), null)
	const verrou = useRef(false)
	const formulaire = useRef<HTMLFormElement>(null)
	const compte = useRef<EtatDuContact>(null)
	const generations = useRef(0)
	const erreurs = etat && 'erreurs' in etat ? etat.erreurs : undefined
	// A new number for each answer: the fields are remounted, and take her typing back as their value.
	const generation = useMemo(() => ++generations.current, [etat])

	useEffect(() => {
		if (!enCours) verrou.current = false
	}, [enCours, etat])

	// Once for each answer, never for a render.
	useEffect(() => {
		if (etat === null || compte.current === etat) return
		compte.current = etat
		suivre('platform_contact_submit', issue(etat))
	}, [etat, suivre])

	// The first field in error takes the focus, once the fields are remounted.
	useEffect(() => {
		if (erreurs) formulaire.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
	}, [erreurs])

	if (etat && 'envoye' in etat)
		return (
			<p
				role="status"
				data-testid="contact-envoye"
				className="mx-auto my-32 max-w-xl rounded-md bg-green-50 p-4 text-center font-semibold text-green-900 text-sm"
			>
				{MESSAGE_ENVOYE}
			</p>
		)

	const valeurs = etat && 'valeurs' in etat ? etat.valeurs : undefined
	const proprietes = (champ: ChampDuContact) => ({
		id: champ,
		name: champ,
		defaultValue: valeurs?.[champ],
		'aria-invalid': erreurs?.[champ] ? (true as const) : undefined,
		'aria-describedby': erreurs?.[champ] ? `erreur-${champ}` : undefined,
		className: CHAMP,
	})

	return (
		<form
			ref={formulaire}
			action={envoyer}
			noValidate
			onSubmit={evenement => {
				if (verrou.current) evenement.preventDefault()
				else verrou.current = true
			}}
			className="mx-auto my-32 max-w-xl px-4 sm:mt-20 md:px-0"
		>
			<div key={generation} className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
				<Champ champ="prenom" large={false} erreur={erreurs?.prenom}>
					<input type="text" autoComplete="given-name" {...proprietes('prenom')} />
				</Champ>
				<Champ champ="nom" large={false} erreur={erreurs?.nom}>
					<input type="text" autoComplete="family-name" {...proprietes('nom')} />
				</Champ>
				<Champ champ="email" erreur={erreurs?.email}>
					<input type="email" inputMode="email" autoComplete="email" {...proprietes('email')} />
				</Champ>
				<Champ champ="telephone" erreur={erreurs?.telephone}>
					<input type="tel" inputMode="tel" autoComplete="tel" {...proprietes('telephone')} />
				</Champ>
				<Champ champ="message" erreur={erreurs?.message}>
					<textarea rows={4} {...proprietes('message')} />
				</Champ>
				<div className="sm:col-span-2">
					<p className="text-gray-600 text-sm leading-6">
						En envoyant votre message, vous acceptez notre{' '}
						<a href="/politique-de-confidentialite" className="font-semibold">
							politique&nbsp;de&nbsp;confidentialité.
						</a>
					</p>
				</div>
			</div>
			<div role="alert" data-testid="erreur-contact" className="mt-6 empty:hidden">
				{erreurs ? <p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{RESUME_DES_ERREURS}</p> : null}
				{etat && 'echec' in etat ? (
					<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{MESSAGE_NON_ENREGISTRE}</p>
				) : null}
			</div>
			<div className="mt-10">
				<button
					type="submit"
					disabled={enCours}
					aria-busy={enCours}
					className="block w-full rounded-md bg-indigo-900 px-3.5 py-2.5 text-center font-semibold text-sm text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-900 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
				>
					{enCours ? 'Envoi…' : 'Envoyer l’email'}
				</button>
			</div>
		</form>
	)
}
