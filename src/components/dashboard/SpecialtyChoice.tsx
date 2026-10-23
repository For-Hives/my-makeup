'use client'

import { useState } from 'react'
import { joinSpecialtyBullets, parseSpecialtyBullets, SPECIALTY_BULLETS, type SpecialtyBullet } from '@/lib/specialty'

const FIELD = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'
const CHIP =
	'relative flex min-h-11 items-center gap-2 rounded-full border border-neutral-400 bg-white px-4 text-sm has-[:checked]:border-neutral-900 has-[:checked]:bg-neutral-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2'

/**
 * One bullet to tick. The real checkbox covers the whole bullet (44 px high) and is invisible; a box
 * drawn next to the label shows its state. A touch anywhere on the bullet ticks it.
 */
function Chip({
	id,
	label,
	checked,
	onChange,
}: {
	id: string
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<label htmlFor={id} className={CHIP}>
			<input
				id={id}
				type="checkbox"
				checked={checked}
				onChange={event => onChange(event.target.checked)}
				className="peer absolute inset-0 size-full cursor-pointer opacity-0"
			/>
			<span
				aria-hidden="true"
				className="flex size-5 shrink-0 items-center justify-center rounded border border-neutral-500 bg-white peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:after:-mt-0.5 peer-checked:after:block peer-checked:after:h-2.5 peer-checked:after:w-1.5 peer-checked:after:rotate-45 peer-checked:after:border-white peer-checked:after:border-r-2 peer-checked:after:border-b-2 peer-checked:after:content-['']"
			/>
			{label}
		</label>
	)
}

/**
 * The speciality as bullets to tick, several possible, and « Autre » which opens a free text (ticket
 * 1010). The form keeps texts only: the bullets travel as their keys joined by a comma. Unticking
 * « Autre » forgets its text, so what is shown is what is saved.
 */
export function SpecialtyChoice({
	idPrefix,
	bullets,
	other,
	onChange,
	error,
	otherError,
}: {
	idPrefix: string
	bullets: string
	other: string
	onChange: (bullets: string, other: string) => void
	error?: string
	otherError?: string
}) {
	const [otherOpen, setOtherOpen] = useState(other !== '')
	const chosen = parseSpecialtyBullets(bullets)

	function toggle(value: SpecialtyBullet, ticked: boolean) {
		const next = ticked ? [...chosen, value] : chosen.filter(known => known !== value)
		onChange(joinSpecialtyBullets(parseSpecialtyBullets(next.join(','))), other)
	}

	return (
		<fieldset aria-describedby={error ? `${idPrefix}-specialite-erreur` : undefined} className="flex flex-col gap-2">
			<legend className="font-medium text-sm">Spécialité</legend>
			<p className="text-neutral-700 text-sm">Choisis une ou plusieurs spécialités.</p>
			<div className="flex flex-wrap gap-2">
				{SPECIALTY_BULLETS.map(({ value, label }) => (
					<Chip
						key={value}
						id={`${idPrefix}-specialite-${value}`}
						label={label}
						checked={chosen.includes(value)}
						onChange={ticked => toggle(value, ticked)}
					/>
				))}
				<Chip
					id={`${idPrefix}-specialite-autre`}
					label="Autre"
					checked={otherOpen}
					onChange={ticked => {
						setOtherOpen(ticked)
						if (!ticked) onChange(bullets, '')
					}}
				/>
			</div>
			{error ? (
				<p id={`${idPrefix}-specialite-erreur`} className="text-red-800 text-sm">
					{error}
				</p>
			) : null}
			{otherOpen ? (
				<div className="flex flex-col gap-1">
					<label htmlFor={`${idPrefix}-specialtyOther`} className="font-medium text-sm">
						Autre (précise)
					</label>
					<input
						id={`${idPrefix}-specialtyOther`}
						type="text"
						autoComplete="off"
						value={other}
						onChange={event => onChange(bullets, event.target.value)}
						aria-invalid={otherError ? true : undefined}
						aria-describedby={otherError ? `${idPrefix}-specialtyOther-erreur` : undefined}
						className={FIELD}
					/>
					{otherError ? (
						<p id={`${idPrefix}-specialtyOther-erreur`} className="text-red-800 text-sm">
							{otherError}
						</p>
					) : null}
				</div>
			) : null}
		</fieldset>
	)
}
