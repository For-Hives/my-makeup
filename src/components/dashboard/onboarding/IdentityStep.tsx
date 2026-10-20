'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { IDENTITY_FIELDS, IDENTITY_LABELS, type IdentityValues } from '@/lib/dashboard/identity'
import { ORIGINES_DECLAREES, ORIGINS_LABELS, onboardingIdentitySchema, STEPS_TITLES } from '@/lib/dashboard/onboarding'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import type { IdentityUpload } from '../IdentityEditor'
import { FailureMessage, FIELD, MAIN_BUTTON, StepFrame } from './shared'

export type Origin = (typeof ORIGINES_DECLAREES)[number]

/**
 * « Comment as-tu connu My Makeup ? » (decision UI-05): one optional answer. It is kept out of the
 * form, of the schema and of every request: nothing about it is stored. The parent counts it (ticket 148) as the
 * `onboarding_source` event once the identity is stored, and nowhere else.
 */
function OriginQuestion({ origine, choisir }: { origine: Origin | null; choisir: (o: Origin | null) => void }) {
	const first = useRef<HTMLInputElement>(null)
	return (
		<fieldset aria-describedby="accueil-origine-aide" className="flex flex-col gap-1">
			<legend className="font-medium text-sm">
				Comment as-tu connu My&nbsp;Makeup&nbsp;? <span className="font-normal text-neutral-600">(facultatif)</span>
			</legend>
			<p id="accueil-origine-aide" className="text-neutral-700 text-sm">
				Ta réponse sert seulement à nos statistiques : elle n’est enregistrée ni dans ton compte ni dans ton profil.
			</p>
			<div className="mt-1 flex flex-col">
				{ORIGINES_DECLAREES.map((valeur, rang) => (
					<label
						key={valeur}
						htmlFor={`accueil-origine-${valeur}`}
						className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm"
					>
						<input
							ref={rang === 0 ? first : undefined}
							id={`accueil-origine-${valeur}`}
							type="radio"
							name="origine"
							value={valeur}
							checked={origine === valeur}
							onChange={() => choisir(valeur)}
							className="size-5 shrink-0 accent-neutral-900"
						/>
						{ORIGINS_LABELS[valeur]}
					</label>
				))}
			</div>
			{origine !== null ? (
				<button
					type="button"
					onClick={() => {
						choisir(null)
						first.current?.focus()
					}}
					className="min-h-11 w-fit px-2 text-sm underline"
				>
					Effacer ma réponse
				</button>
			) : null}
		</fieldset>
	)
}

/**
 * The first step: her identity (ticket 140). The same fields as the card of her space, with the
 * speciality required. The next step opens only once the server has answered that it stored them; a
 * failure keeps what she typed and says so. Two clicks, or Enter held, send one request.
 */
export function IdentityStep({
	valeurs,
	envoyer,
	origine,
	choisirOrigine,
	titre,
	surFait,
}: {
	valeurs: IdentityValues
	envoyer: IdentityUpload
	origine: Origin | null
	choisirOrigine: (origine: Origin | null) => void
	titre: React.RefObject<HTMLHeadingElement | null>
	surFait: (valeurs: IdentityValues) => void
}) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<IdentityValues>({ resolver: zodResolver(onboardingIdentitySchema), defaultValues: valeurs })
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [expiredSession, setExpiredSession] = useState(false)
	const lock = useRef(false)

	async function save(saisie: IdentityValues) {
		setPending(true)
		setMessage('')
		setExpiredSession(false)
		try {
			const result: SaveResult<IdentityValues> = await envoyer(saisie).catch(() => ({
				ok: false,
				message: FAILURE_MESSAGE,
			}))
			if (result.ok) {
				surFait(result.valeurs)
				return
			}
			setExpiredSession(result.session === 'expiree')
			setMessage(result.message)
			for (const field of IDENTITY_FIELDS) {
				const text = result.champs?.[field]
				if (text) setError(field, { message: text })
			}
		} finally {
			lock.current = false
			setPending(false)
		}
	}

	return (
		<StepFrame
			titre={STEPS_TITLES[1]}
			explication="Ton prénom, ton nom et ta spécialité seront visibles sur ta page."
			reference={titre}
		>
			<form
				noValidate
				aria-busy={pending}
				onSubmit={evenement => {
					evenement.preventDefault()
					if (lock.current) return
					lock.current = true
					void handleSubmit(save, () => {
						lock.current = false
					})(evenement)
				}}
				className="flex flex-col gap-4"
			>
				{IDENTITY_FIELDS.map(champ => {
					const error = errors[champ]?.message
					const optional = champ === 'nomArtiste'
					return (
						<div key={champ} className="flex flex-col gap-1">
							<label htmlFor={`accueil-${champ}`} className="font-medium text-sm">
								{IDENTITY_LABELS[champ].libelle}
								{optional ? <span className="font-normal text-neutral-600"> (facultatif)</span> : null}
							</label>
							<input
								id={`accueil-${champ}`}
								type="text"
								autoComplete="off"
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? `accueil-${champ}-erreur` : undefined}
								className={FIELD}
								{...register(champ)}
							/>
							{error ? (
								<p id={`accueil-${champ}-erreur`} className="text-red-800 text-sm">
									{error}
								</p>
							) : null}
						</div>
					)
				})}
				<OriginQuestion origine={origine} choisir={choisirOrigine} />
				<FailureMessage message={message} sessionExpiree={expiredSession} />
				<button type="submit" disabled={pending} className={MAIN_BUTTON}>
					{pending ? 'Enregistrement…' : 'Suivant'}
				</button>
			</form>
		</StepFrame>
	)
}
