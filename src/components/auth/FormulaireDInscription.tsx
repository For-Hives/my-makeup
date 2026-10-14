'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
	CHAMP_PIEGE,
	type ChampInscription,
	type CodeEchecInscription,
	type ErreursInscription,
	MESSAGES_ECHEC_INSCRIPTION,
	MOT_DE_PASSE_MIN,
} from '@/lib/auth/inscription'

export type EtatDInscription = {
	erreurs?: ErreursInscription
	echec?: CodeEchecInscription
	valeurs?: { nom: string; email: string; cgu: boolean }
} | null
export type ActionDInscription = (precedent: EtatDInscription, formulaire: FormData) => Promise<EtatDInscription>

const CHAMP =
	'rounded-md border border-neutral-300 bg-white px-3 py-2 font-normal text-base aria-[invalid=true]:border-red-600'

function Erreur({ champ, erreurs }: { champ: ChampInscription; erreurs: ErreursInscription | undefined }) {
	const message = erreurs?.[champ]
	return (
		<p id={`erreur-${champ}`} className="text-red-800 text-sm" data-testid={`erreur-${champ}`}>
			{message}
		</p>
	)
}

const TROP_DE_TENTATIVES = MESSAGES_ECHEC_INSCRIPTION['trop-de-tentatives']

/**
 * Past 5 sign-ups an hour, the proxy answers 429 with the sentence above as its body (ticket 084), and
 * the client script of Next throws that body as the message of the failed action. It is turned back
 * into the state of a refusal, so the form shows it under its fields instead of an error page.
 */
export function avecLeRefusDuProxy(action: ActionDInscription): ActionDInscription {
	return async (precedent, formulaire) => {
		try {
			return await action(precedent, formulaire)
		} catch (erreur) {
			if (!(erreur instanceof Error) || !erreur.message.includes(TROP_DE_TENTATIVES)) throw erreur
			const texte = (cle: string) => {
				const valeur = formulaire.get(cle)
				return typeof valeur === 'string' ? valeur : ''
			}
			return {
				echec: 'trop-de-tentatives',
				valeurs: { nom: texte('nom'), email: texte('email'), cgu: formulaire.get('cgu') === 'on' },
			}
		}
	}
}

/**
 * The sign-up form (ticket 082). The page does not block the submit: the server checks the same
 * rules and answers one message per field, under the field, so that the wording is the same with or
 * without scripts. A key held down sends one request, as in the sign-in form.
 */
export function FormulaireDInscription({ action }: { action: ActionDInscription }) {
	const [etat, envoyer, enCours] = useActionState(avecLeRefusDuProxy(action), null)
	const verrou = useRef(false)
	const erreurs = etat?.erreurs

	useEffect(() => {
		if (!enCours) verrou.current = false
	}, [enCours, etat])

	const proprietes = (champ: ChampInscription) => ({
		'aria-invalid': erreurs?.[champ] ? (true as const) : undefined,
		'aria-describedby': erreurs?.[champ] ? `erreur-${champ}` : undefined,
	})

	return (
		<form
			action={envoyer}
			noValidate
			onSubmit={evenement => {
				if (verrou.current) evenement.preventDefault()
				else verrou.current = true
			}}
			className="flex w-full max-w-sm flex-col gap-4 text-left"
		>
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="nom">
				Nom
				<input
					id="nom"
					name="nom"
					type="text"
					autoComplete="name"
					defaultValue={etat?.valeurs?.nom}
					className={CHAMP}
					{...proprietes('nom')}
				/>
			</label>
			<Erreur champ="nom" erreurs={erreurs} />
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="email">
				Adresse email
				<input
					id="email"
					name="email"
					type="email"
					inputMode="email"
					autoComplete="email"
					defaultValue={etat?.valeurs?.email}
					className={CHAMP}
					{...proprietes('email')}
				/>
			</label>
			<Erreur champ="email" erreurs={erreurs} />
			<label className="flex flex-col gap-1 font-medium text-sm" htmlFor="password">
				Mot de passe
				<input
					id="password"
					name="password"
					type="password"
					autoComplete="new-password"
					className={CHAMP}
					aria-describedby={erreurs?.password ? 'erreur-password aide-password' : 'aide-password'}
					aria-invalid={erreurs?.password ? true : undefined}
				/>
			</label>
			<p id="aide-password" className="-mt-2 text-neutral-600 text-xs">
				{MOT_DE_PASSE_MIN} caractères au moins.
			</p>
			<Erreur champ="password" erreurs={erreurs} />
			<label className="flex items-start gap-2 text-sm" htmlFor="cgu">
				<input
					id="cgu"
					name="cgu"
					type="checkbox"
					defaultChecked={etat?.valeurs?.cgu}
					className="mt-1 h-4 w-4"
					{...proprietes('cgu')}
				/>
				<span>
					J’accepte les {/* A plain link: it opens in another tab, so the form she is filling stays as it is. */}
					<a href="/cgu" className="underline" target="_blank" rel="noopener">
						conditions générales
					</a>
					.
				</span>
			</label>
			<Erreur champ="cgu" erreurs={erreurs} />
			{/* The trap (ticket 084): out of sight and of the tab order, and hidden from screen readers. A person never fills it. */}
			<div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
				<label htmlFor={CHAMP_PIEGE}>
					Laisse ce champ vide
					<input id={CHAMP_PIEGE} name={CHAMP_PIEGE} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
				</label>
			</div>
			<div role="alert" data-testid="erreur-inscription">
				{etat?.echec ? (
					<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">{MESSAGES_ECHEC_INSCRIPTION[etat.echec]}</p>
				) : null}
			</div>
			<button
				type="submit"
				disabled={enCours}
				aria-busy={enCours}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:cursor-wait disabled:opacity-60"
			>
				{enCours ? 'Inscription…' : 'S’inscrire'}
			</button>
		</form>
	)
}
