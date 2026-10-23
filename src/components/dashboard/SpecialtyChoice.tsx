'use client'

import { useState } from 'react'
import { joinSpecialtyBullets, parseSpecialtyBullets, SPECIALTY_BULLETS, type SpecialtyBullet } from '@/lib/specialty'

const FIELD = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'
const CHIP =
	'flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-neutral-400 bg-white px-4 text-sm has-[:checked]:border-neutral-900 has-[:checked]:bg-neutral-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2'

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
					<label key={value} htmlFor={`${idPrefix}-specialite-${value}`} className={CHIP}>
						<input
							id={`${idPrefix}-specialite-${value}`}
							type="checkbox"
							checked={chosen.includes(value)}
							onChange={event => toggle(value, event.target.checked)}
							className="size-5 shrink-0 accent-neutral-900"
						/>
						{label}
					</label>
				))}
				<label htmlFor={`${idPrefix}-specialite-autre`} className={CHIP}>
					<input
						id={`${idPrefix}-specialite-autre`}
						type="checkbox"
						checked={otherOpen}
						onChange={event => {
							setOtherOpen(event.target.checked)
							if (!event.target.checked) onChange(bullets, '')
						}}
						className="size-5 shrink-0 accent-neutral-900"
					/>
					Autre
				</label>
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
