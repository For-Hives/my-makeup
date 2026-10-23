'use client'

import type { ReactNode } from 'react'
import { type Resolver, useForm } from 'react-hook-form'
import { trackSave } from '@/lib/dashboard/analytics'
import { NETWORKS, type NetworkField, type NetworksValues, readNetworks } from '@/lib/dashboard/networks'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { readableLabel } from '@/lib/profile/public-view'
import { BlockForm, FIELD_CLASS } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type NetworksSave = (values: NetworksValues) => Promise<SaveResult<NetworksValues>>

/** The fields in the order of her page: the public order is fixed, Instagram first. */
const PAGE_ORDER: readonly NetworkField[] = ['instagram', 'facebook', 'linkedin', 'youtube', 'siteWeb']

const CHANNEL = {
	instagram: 'instagram',
	facebook: 'facebook',
	linkedin: 'linkedin',
	youtube: 'youtube',
	siteWeb: 'website',
} as const

/**
 * The form reads what she typed by the rule of the server (`readNetworks`): « @pseudo » becomes the
 * address, an address of another site is refused under its field, and nothing is sent while a field is
 * refused. The values the form sends are the normalised ones.
 */
const resolver: Resolver<NetworksValues> = values => {
	const parsed = readNetworks(values)
	if (parsed.ok) return { values: parsed.valeurs, errors: {} }
	return {
		values: {},
		errors: Object.fromEntries(
			PAGE_ORDER.flatMap(field => {
				const message = parsed.champs[field]
				return message === undefined ? [] : [[field, { type: 'validate', message }]]
			})
		),
	}
}

/**
 * Her networks and her website, edited in place (issue 1021). The page shows « @pseudo » and the domain
 * (never the raw address) and its links leave with `rel="noopener nofollow noreferrer"`: the editor says,
 * under each field, what the link will read. An address that is not the network's own is refused with its
 * message, by the same rule as the server. The order of the links on her page is fixed (Instagram first);
 * it is told in the editor, not chosen.
 */
export function NetworksBlock({
	values,
	save,
	children,
}: {
	values: NetworksValues
	save: NetworksSave
	/** The block as the visitor sees it, or `null` while there is no network. */
	children: ReactNode | null
}) {
	return (
		<EditableBlock
			id="networks"
			title="Réseaux sociaux"
			penLabel="Modifier mes réseaux"
			empty={children === null}
			shape="card"
			className="w-full min-w-0"
			penClassName="right-3 top-3"
			invitation={
				<span className="pr-8">
					<b className="text-lipstick">Ajoute ton Instagram ou ton site.</b> Un lien suffit : @ton.pseudo ou l’adresse
					de ta page.
				</span>
			}
			editor={<NetworksForm values={values} save={save} />}
		>
			{children}
		</EditableBlock>
	)
}

function NetworksForm({ values, save }: { values: NetworksValues; save: NetworksSave }) {
	const {
		register,
		handleSubmit,
		setError,
		watch,
		formState: { errors, isDirty },
	} = useForm<NetworksValues>({ resolver, defaultValues: values })
	const typed = watch()

	return (
		<BlockForm
			title="Modifier mes réseaux"
			dirty={isDirty}
			keepsHint="ta saisie est toujours là"
			onFailure={failure => {
				for (const field of PAGE_ORDER) {
					const text = failure.fields?.[field]
					if (text) setError(field, { message: text })
				}
			}}
			onSend={() =>
				new Promise(resolve => {
					// Refused in the browser: the message is under the field and nothing is sent.
					void handleSubmit(
						async input => {
							const result = await save(input).catch(
								(): SaveResult<NetworksValues> => ({ ok: false, message: FAILURE_MESSAGE })
							)
							trackSave('reseaux', result)
							resolve(result)
						},
						() => resolve(null)
					)()
				})
			}
		>
			<p className="text-mute text-sm">
				Sur ta page, les liens s’affichent dans cet ordre. Un champ vide retire le lien. Un réseau est un moyen de te
				contacter : il compte pour rendre ton profil publiable.
			</p>
			<div className="grid gap-4 sm:grid-cols-2">
				{PAGE_ORDER.map(field => {
					const error = errors[field]?.message
					const read = readNetworks({ [field]: typed[field] ?? '' })
					const normalized = read.ok ? read.valeurs[field] : ''
					const shown =
						normalized === ''
							? ''
							: readableLabel(
									CHANNEL[field],
									normalized,
									normalized.startsWith('http') ? normalized : `https://${normalized}`
								)
					return (
						<div key={field} className="flex flex-col gap-1">
							<label htmlFor={`direct-networks-${field}`} className="font-medium text-sm">
								{NETWORKS[field].libelle}
							</label>
							<input
								id={`direct-networks-${field}`}
								type="text"
								autoComplete="off"
								autoCapitalize="none"
								spellCheck={false}
								placeholder={NETWORKS[field].exemple}
								aria-invalid={error ? true : undefined}
								aria-describedby={`direct-networks-${field}-help${error ? ` direct-networks-${field}-error` : ''}`}
								className={FIELD_CLASS}
								{...register(field)}
							/>
							<p id={`direct-networks-${field}-help`} className="min-h-5 text-mute text-sm">
								{shown ? `Sur ta page : ${shown}` : ''}
							</p>
							{error ? (
								<p id={`direct-networks-${field}-error`} className="text-lipstick-800 text-sm">
									{error}
								</p>
							) : null}
						</div>
					)
				})}
			</div>
		</BlockForm>
	)
}
