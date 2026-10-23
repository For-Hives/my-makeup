'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { BADGE_HELP_PATH, BADGE_LABEL } from '@/lib/activity/badge-text'
import type { ActivityView } from '@/lib/dashboard/activity'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { type SiretValues, siretSchema } from '@/lib/dashboard/siret'
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type SiretSave = (values: SiretValues) => Promise<SaveResult<SiretValues>>

/** Where the check stands, told to her in a sentence. Exported for the tests. */
export function stateSentence(view: ActivityView): string {
	switch (view.state) {
		case 'pending':
			return 'Ton SIRET est enregistré. Le contrôle a lieu dans la journée qui suit : le badge apparaît dès que l’annuaire public confirme ton activité.'
		case 'active':
			return view.checkedOn
				? `Le badge « ${BADGE_LABEL} » s’affiche sur ta page. Dernier contrôle : le ${view.checkedOn}.`
				: `Le badge « ${BADGE_LABEL} » s’affiche sur ta page.`
		case 'ceased':
			return 'L’annuaire public indique que cette activité est cessée : le badge ne s’affiche pas. Si ce n’est pas le bon numéro, remplace-le.'
		case 'not-found':
			return 'Ce SIRET est introuvable dans l’annuaire public : le badge ne s’affiche pas. Vérifie ton numéro et corrige-le au besoin ; un nouveau numéro relance le contrôle.'
		default:
			return ''
	}
}

/**
 * Her SIRET, edited in place (issue 1004). It is optional, for her eyes only (a private card, absent from the page
 * a visitor sees), and used for one thing: the daily check, in the public business registry, that her activity is
 * in progress, which gives the badge « Activité vérifiée ». She is told so, that nothing is shown, and that
 * leaving it empty costs her nothing in the search.
 *
 * `view` is where the check stands: read by the server with the page, so it follows the save when the page is
 * read again.
 */
export function SiretBlock({ view, save }: { view: ActivityView; save: SiretSave }) {
	const given = view.siret !== null
	return (
		<EditableBlock
			id="siret"
			title="SIRET et badge « Activité vérifiée »"
			penLabel="Modifier mon SIRET"
			empty={!given}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={
				<span className="pr-8">
					<b className="text-lipstick">Ajoute ton SIRET (facultatif).</b> Il sert à afficher le badge « {BADGE_LABEL} »
					sur ta page. Tu es la seule à le voir.
				</span>
			}
			editor={<SiretForm view={view} save={save} />}
		>
			<section className="w-full min-w-0 rounded-card border border-hairline bg-white p-6">
				<h2 className="font-bold text-lg text-ink">Mon SIRET</h2>
				<p className="mt-1 text-mute text-sm">Visible de toi seule, jamais sur ta page.</p>
				<p className="mt-3 font-medium text-ink">{view.siret}</p>
				<p className="mt-2 text-ink text-sm" data-activity-state={view.state}>
					{stateSentence(view)}
				</p>
			</section>
		</EditableBlock>
	)
}

function SiretForm({ view, save }: { view: ActivityView; save: SiretSave }) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<SiretValues>({ resolver: zodResolver(siretSchema), defaultValues: { siret: view.siret ?? '' } })
	const error = errors.siret?.message
	return (
		<BlockForm
			title="Modifier mon SIRET"
			dirty={isDirty}
			keepsHint="ta saisie est toujours là"
			onFailure={failure => {
				const text = failure.fields?.siret
				if (text) setError('siret', { message: text })
			}}
			onSend={() =>
				new Promise(resolve => {
					// Refused in the browser: the message is under the field and nothing is sent.
					void handleSubmit(
						async input => {
							const result = await save(input).catch(
								(): SaveResult<SiretValues> => ({ ok: false, message: FAILURE_MESSAGE })
							)
							resolve(result)
						},
						() => resolve(null)
					)()
				})
			}
		>
			<div className="flex flex-col gap-1">
				<label htmlFor="direct-siret" className="font-medium text-sm">
					Numéro SIRET (14 chiffres)
				</label>
				<input
					id="direct-siret"
					type="text"
					inputMode="numeric"
					autoComplete="off"
					spellCheck={false}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? 'direct-siret-help direct-siret-error' : 'direct-siret-help'}
					className={FIELD_CLASS}
					{...register('siret')}
				/>
				{error ? (
					<p id="direct-siret-error" className="text-lipstick-800 text-sm">
						{error}
					</p>
				) : null}
			</div>
			<div id="direct-siret-help" className="flex flex-col gap-2 rounded-2xl bg-nude-100 p-4 text-mute text-sm">
				<p>
					Facultatif. Ton SIRET sert à une seule chose : vérifier chaque jour, dans l’annuaire public des entreprises,
					que ton activité est en cours. Si c’est le cas, le badge « {BADGE_LABEL} » s’affiche sur ta page et sur ta
					fiche dans la recherche.
				</p>
				<p>
					Il n’est jamais affiché ni transmis aux clientes. Sans SIRET, tu n’es ni moins bien classée ni moins bien
					placée dans la recherche. Vide le champ pour le supprimer.{' '}
					<Link
						href={BADGE_HELP_PATH}
						className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-2"
					>
						Qu’est-ce que c’est ?
					</Link>
				</p>
			</div>
		</BlockForm>
	)
}
