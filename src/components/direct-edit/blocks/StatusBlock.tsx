'use client'

import { type ReactNode, useState } from 'react'
import { trackSave } from '@/lib/dashboard/analytics'
import type { AvailabilityValues } from '@/lib/dashboard/availability'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { BlockForm } from '../BlockForm'
import { EditableBlock } from '../EditableBlock'

export type StatusSave = (valeurs: AvailabilityValues) => Promise<SaveResult<AvailabilityValues>>

const OPTIONS = [
	{ value: true, label: 'Je prends de nouvelles dates', help: 'Ton profil apparaît dans la recherche.' },
	{ value: false, label: 'Je suis indisponible', help: 'Ton profil n’apparaît plus dans les résultats de recherche.' },
] as const

/** Her availability, set in place (issue 1008): the status of the header, with the same save as the switch of her space. */
export function StatusBlock({
	available,
	save,
	children,
}: {
	available: boolean
	save: StatusSave
	children: ReactNode
}) {
	return (
		<EditableBlock
			id="status"
			title="Disponibilité"
			penLabel="Modifier ma disponibilité"
			empty={false}
			invitation={null}
			shape="pill"
			className="shrink-0"
			penClassName="-right-2 -top-6"
			editor={<StatusForm available={available} save={save} />}
		>
			<div>{children}</div>
		</EditableBlock>
	)
}

function StatusForm({ available, save }: { available: boolean; save: StatusSave }) {
	const [choice, setChoice] = useState(available)
	return (
		<BlockForm
			title="Modifier ma disponibilité"
			dirty={choice !== available}
			keepsHint="ton choix est toujours là"
			onSend={async () => {
				const result = await save({ disponible: choice }).catch(
					(): SaveResult<AvailabilityValues> => ({ ok: false, message: FAILURE_MESSAGE })
				)
				trackSave('disponibilite', result)
				return result
			}}
		>
			<fieldset className="flex flex-col gap-3">
				<legend className="mb-2 font-medium text-sm">Où en es-tu ?</legend>
				{OPTIONS.map(option => (
					<label
						key={String(option.value)}
						className="flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-hairline bg-blush p-4 has-[:checked]:border-lipstick has-[:checked]:bg-white"
					>
						<input
							type="radio"
							name="direct-status"
							checked={choice === option.value}
							onChange={() => setChoice(option.value)}
							className="mt-1 h-5 w-5 accent-lipstick"
						/>
						<span>
							<span className="block font-semibold">{option.label}</span>
							<span className="text-mute text-sm">{option.help}</span>
						</span>
					</label>
				))}
			</fieldset>
		</BlockForm>
	)
}
