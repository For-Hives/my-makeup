'use client'

import { type ReactNode, useRef, useState } from 'react'
import { BlockForm, FIELD_CLASS } from '@/components/direct-edit/BlockForm'
import type { RowsSave } from '@/components/direct-edit/blocks/RowsBlock'
import { trackSave } from '@/lib/dashboard/analytics'
import { flagshipErrors, flagshipRows } from '@/lib/dashboard/flagship-offer'
import type { SavedList, SavedRow } from '@/lib/dashboard/list'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { inputPrice } from '@/lib/dashboard/service-offers'
import { formatAmount, parsePrice } from '@/lib/price'
import { OFFER_MODELS, type OfferModel, offerModelOf } from '@/lib/price-median'

/**
 * The fifth step, « Ta prestation phare » (issue 1009): one offer, in two touches. A model fills the
 * name (the three buttons of the offers block of the direct edition), one field takes the price, and under
 * it the median of the published offers of the same model, when there are enough of them to name nobody.
 * The save is that of her space: the offers she already has stay, in the list sent (`flagshipRows`).
 */
export function OfferStep({
	rows,
	medians,
	save,
	cancel,
}: {
	rows: readonly SavedRow[]
	medians: Readonly<Record<OfferModel['label'], number | null>>
	save: RowsSave
	cancel: ReactNode
}) {
	const [name, setName] = useState('')
	const [price, setPrice] = useState('')
	const [errors, setErrors] = useState<{ name?: string; price?: string }>({})
	const priceField = useRef<HTMLInputElement>(null)

	const model = offerModelOf(name)
	const median = model === null ? null : (medians[model.label] ?? null)
	const amount = parsePrice(inputPrice(price)).priceFrom
	const read = amount === null ? '' : `Montant retenu pour ton profil : ${formatAmount(amount)}.`

	async function send() {
		const found = flagshipErrors({ name, price })
		setErrors(found)
		if (found.name !== undefined || found.price !== undefined) {
			;(found.name !== undefined ? document.getElementById('accueil-prestation-nom') : priceField.current)?.focus()
			return null
		}
		const result = await save({ lignes: flagshipRows(rows, { name, price }) }).catch(
			(): SaveResult<SavedList> => ({ ok: false, message: FAILURE_MESSAGE })
		)
		trackSave('offres', result)
		return result
	}

	return (
		<BlockForm
			title="Ta prestation phare"
			dirty={name !== '' || price !== ''}
			submitLabel="Terminer"
			cancel={cancel}
			keepsHint="ta saisie est toujours là"
			onFailure={failure => {
				const text = failure.fields?.lignes
				if (text) setErrors({ price: text })
			}}
			onSend={send}
		>
			<div className="flex flex-col gap-2">
				<p className="font-medium text-sm">Pour démarrer, touche un modèle</p>
				<div className="flex flex-wrap gap-2">
					{OFFER_MODELS.map(({ label, name: modelName }) => (
						<button
							key={label}
							type="button"
							aria-label={`Modèle ${label}`}
							aria-pressed={name === modelName}
							onClick={() => {
								setName(modelName)
								setErrors(current => ({ ...current, name: undefined }))
								priceField.current?.focus()
							}}
							className={`min-h-11 rounded-full border px-5 font-semibold text-sm focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2 ${
								name === modelName ? 'border-lipstick bg-lipstick text-white' : 'border-lipstick bg-white text-lipstick'
							}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<label htmlFor="accueil-prestation-nom" className="font-medium text-sm">
					Nom de la prestation
				</label>
				<input
					id="accueil-prestation-nom"
					type="text"
					autoComplete="off"
					value={name}
					onChange={event => {
						setName(event.target.value)
						setErrors(current => ({ ...current, name: undefined }))
					}}
					aria-invalid={errors.name ? true : undefined}
					aria-describedby={errors.name ? 'accueil-prestation-nom-erreur' : undefined}
					className={FIELD_CLASS}
				/>
				{errors.name ? (
					<p id="accueil-prestation-nom-erreur" className="text-lipstick-800 text-sm">
						{errors.name}
					</p>
				) : null}
			</div>
			<div className="flex flex-col gap-1">
				<label htmlFor="accueil-prestation-prix" className="font-medium text-sm">
					Prix
				</label>
				<input
					ref={priceField}
					id="accueil-prestation-prix"
					type="text"
					inputMode="decimal"
					autoComplete="off"
					placeholder="150"
					value={price}
					onChange={event => {
						setPrice(event.target.value)
						setErrors(current => ({ ...current, price: undefined }))
					}}
					aria-invalid={errors.price ? true : undefined}
					aria-describedby={`accueil-prestation-prix-aide${errors.price ? ' accueil-prestation-prix-erreur' : ''}`}
					className={FIELD_CLASS}
				/>
				<div id="accueil-prestation-prix-aide" className="flex min-h-5 flex-col gap-1 text-mute text-sm">
					<p>{read || 'Un montant en euros, par exemple 150 ou à partir de 150.'}</p>
					{median !== null && model !== null ? (
						<p data-testid="repere-prix">
							Repère : le prix médian des prestations « {model.label.toLowerCase()} » publiées sur My&nbsp;Makeup est de{' '}
							{formatAmount(median)}.
						</p>
					) : null}
				</div>
				{errors.price ? (
					<p id="accueil-prestation-prix-erreur" className="text-lipstick-800 text-sm">
						{errors.price}
					</p>
				) : null}
			</div>
		</BlockForm>
	)
}
