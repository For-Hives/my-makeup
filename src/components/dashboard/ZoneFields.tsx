'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from 'react'
import type { Resolver, UseFormRegister } from 'react-hook-form'
import { z } from 'zod'
import { countryByCode, flag } from '@/lib/countries'
import { matchingCountries } from '@/lib/dashboard/country-search'
import { enteredRadiusSchema, type LocationValues, type SuggestedCity } from '@/lib/dashboard/location'
import { radiusAsked, type ZoneChoice } from '@/lib/dashboard/zone-choice'
import { COUNTRIES_MAX, RADIUS_BOUNDS_KM } from '@/lib/profile/zone'
import { type CitiesSearch, CityField } from './CityField'

/** What the form holds beside the zone: the radius as typed, and « à domicile ». */
export const zoneFormSchema = z.object({ rayon: enteredRadiusSchema, aDomicile: z.boolean() })
export type ZoneFormValues = z.infer<typeof zoneFormSchema>

/**
 * The resolver of the form: the radius is checked only while it is asked (`radiusAsked`). Hidden
 * behind several countries, a radius typed before is not sent and must not stop the save.
 */
export function zoneResolver(radiusAsked: { current: boolean }): Resolver<ZoneFormValues> {
	const resolve = zodResolver(zoneFormSchema)
	return (values, context, options) =>
		resolve(radiusAsked.current ? values : { ...values, rayon: '' }, context, options)
}

const FIELD = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'
const LINK = 'min-h-11 w-fit rounded-md px-1 text-left font-medium text-indigo-900 text-sm underline'

/**
 * The zone of the makeup artist, as her space and the second step of the onboarding ask it (tickets
 * 265 and 266; PLAN-ZONES.md §3.3 and §3.4): the question « Où travailles-tu ? », a single field that
 * proposes communes (by name or postal code) and countries, or, behind the link « Je travaille à
 * l’étranger ou dans plusieurs pays », a list of countries as chips with a town when the country is
 * alone. Then the radius, asked around a commune or a single country, and « à domicile ».
 *
 * It holds no data of its own: `choix` is the parent's, `onChoix` tells it what changes. The
 * parent builds the request from it (src/lib/dashboard/zone-choice.ts).
 */
export function ZoneFields({
	valeurs,
	choix,
	onChoix,
	chercher,
	erreurZone,
	erreurVille,
	erreurRayon,
	register,
	rayonFacultatif,
}: {
	valeurs: LocationValues
	choix: ZoneChoice
	onChoix: (choix: ZoneChoice) => void
	chercher: CitiesSearch
	erreurZone: string
	erreurVille: string
	erreurRayon: string | undefined
	register: UseFormRegister<ZoneFormValues>
	/** The step of the onboarding says « (facultatif) » beside the radius; the space does not. */
	rayonFacultatif: boolean
}) {
	const id = useId()
	const lastCity = useRef<SuggestedCity | null>(valeurs.kind === 'city' ? cityOf(valeurs) : null)
	if (choix.kind === 'city') lastCity.current = choix.city
	const pickerRef = useRef<HTMLInputElement>(null)
	const [focusPicker, setFocusPicker] = useState(0)
	useEffect(() => {
		if (focusPicker > 0) pickerRef.current?.focus()
	}, [focusPicker])

	return (
		<div className="flex flex-col gap-4">
			{choix.kind === 'city' ? (
				<div className="flex flex-col gap-1">
					<label htmlFor={`${id}-zone`} className="font-medium text-sm">
						Où travailles-tu ?
					</label>
					<CityField
						id={`${id}-zone`}
						idErreur={`${id}-zone-erreur`}
						libelleInitial={choix.city?.libelle ?? ''}
						chercher={chercher}
						erreur={erreurZone}
						onChoisir={city => onChoix({ kind: 'city', city })}
						onChoisirPays={code => {
							onChoix({ kind: 'countries', countries: [code], town: '' })
							setFocusPicker(count => count + 1)
						}}
					/>
					<button
						type="button"
						className={LINK}
						onClick={() => {
							onChoix({ kind: 'countries', countries: [], town: '' })
							setFocusPicker(count => count + 1)
						}}
					>
						Je travaille à l’étranger ou dans plusieurs pays
					</button>
				</div>
			) : (
				<CountriesChooser
					id={id}
					choix={choix}
					onChoix={onChoix}
					erreurZone={erreurZone}
					erreurVille={erreurVille}
					pickerRef={pickerRef}
					onBack={() => onChoix({ kind: 'city', city: lastCity.current })}
					onFocusPicker={() => setFocusPicker(count => count + 1)}
				/>
			)}
			{radiusAsked(choix) ? (
				<div className="flex flex-col gap-1">
					<label htmlFor={`${id}-rayon`} className="font-medium text-sm">
						Rayon d’action (en km){' '}
						{rayonFacultatif ? <span className="font-normal text-neutral-600">(facultatif)</span> : null}
					</label>
					<input
						id={`${id}-rayon`}
						type="text"
						inputMode="numeric"
						autoComplete="off"
						aria-invalid={erreurRayon ? true : undefined}
						aria-describedby={`${id}-rayon-aide${erreurRayon ? ` ${id}-rayon-erreur` : ''}`}
						className={`${FIELD} w-32`}
						{...register('rayon')}
					/>
					<p id={`${id}-rayon-aide`} className="text-neutral-700 text-sm">
						De {RADIUS_BOUNDS_KM.min} à {RADIUS_BOUNDS_KM.max} km, en kilomètres entiers.
						{rayonFacultatif ? '' : ' Tu peux laisser vide.'}
					</p>
					{erreurRayon ? (
						<p id={`${id}-rayon-erreur`} className="text-red-800 text-sm">
							{erreurRayon}
						</p>
					) : null}
				</div>
			) : null}
			<div className="flex items-center gap-3">
				<input
					id={`${id}-domicile`}
					type="checkbox"
					className="size-6 shrink-0 accent-neutral-900"
					{...register('aDomicile')}
				/>
				<label htmlFor={`${id}-domicile`} className="min-h-11 flex-1 content-center font-medium text-sm">
					Je me déplace à domicile
				</label>
			</div>
		</div>
	)
}

/** The commune stored, as the field proposes one. */
function cityOf(valeurs: LocationValues): SuggestedCity | null {
	return valeurs.codeInsee === ''
		? null
		: { codeInsee: valeurs.codeInsee, libelle: valeurs.libelle, nom: valeurs.libelle }
}

/**
 * The countries as chips, five at most, and the town when one foreign country is alone. « Retirer
 * Belgique » is the name of the button of each chip; the flag is only for the eye.
 */
function CountriesChooser({
	id,
	choix,
	onChoix,
	erreurZone,
	erreurVille,
	pickerRef,
	onBack,
	onFocusPicker,
}: {
	id: string
	choix: Extract<ZoneChoice, { kind: 'countries' }>
	onChoix: (choix: ZoneChoice) => void
	erreurZone: string
	erreurVille: string
	pickerRef: RefObject<HTMLInputElement | null>
	onBack: () => void
	onFocusPicker: () => void
}) {
	const { countries, town } = choix
	const full = countries.length >= COUNTRIES_MAX
	const alone = countries.length === 1 && countries[0] !== 'FR'

	return (
		<fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
			<legend className="mb-2 p-0 font-medium text-sm">Où travailles-tu ?</legend>
			{countries.length > 0 ? (
				<ul aria-label="Pays choisis" className="flex flex-wrap gap-2">
					{countries.map(code => {
						const name = countryByCode(code)?.name ?? code
						return (
							<li
								key={code}
								className="flex min-h-11 items-center gap-1 rounded-full border border-neutral-400 bg-white pl-3"
							>
								<span aria-hidden="true">{flag(code)}</span>
								<span className="text-base">{name}</span>
								<button
									type="button"
									aria-label={`Retirer ${name}`}
									onClick={() => {
										const left = countries.filter(autre => autre !== code)
										onChoix({ kind: 'countries', countries: left, town: left.length === 1 ? town : '' })
										onFocusPicker()
									}}
									className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg"
								>
									<span aria-hidden="true">×</span>
								</button>
							</li>
						)
					})}
				</ul>
			) : null}
			{full ? (
				<p className="text-neutral-700 text-sm">
					{COUNTRIES_MAX} pays au plus : retire-en un pour en ajouter un autre.
				</p>
			) : (
				<CountryPicker
					id={`${id}-ajout`}
					chosen={countries}
					inputRef={pickerRef}
					onPick={code => onChoix({ kind: 'countries', countries: [...countries, code], town: '' })}
				/>
			)}
			{erreurZone ? <p className="text-red-800 text-sm">{erreurZone}</p> : null}
			{alone ? (
				<div className="flex flex-col gap-1">
					<label htmlFor={`${id}-ville`} className="font-medium text-sm">
						Ville (facultatif)
					</label>
					<input
						id={`${id}-ville`}
						type="text"
						autoComplete="off"
						maxLength={70}
						value={town}
						aria-invalid={erreurVille ? true : undefined}
						aria-describedby={`${id}-ville-aide${erreurVille ? ` ${id}-ville-erreur` : ''}`}
						onChange={evenement => onChoix({ kind: 'countries', countries, town: evenement.target.value })}
						className={FIELD}
					/>
					<p id={`${id}-ville-aide`} className="text-neutral-700 text-sm">
						Le nom de ta ville, pas ton adresse : elle ne s’enregistre jamais.
					</p>
					{erreurVille ? (
						<p id={`${id}-ville-erreur`} className="text-red-800 text-sm">
							{erreurVille}
						</p>
					) : null}
				</div>
			) : null}
			<button type="button" className={LINK} onClick={onBack}>
				Revenir à une commune en France
			</button>
		</fieldset>
	)
}

/**
 * « Ajouter un pays »: an ARIA combobox on the embedded list of countries, filtered in the browser.
 * The arrows move, Enter adds the country in focus (or the only one left), Escape closes the list.
 */
function CountryPicker({
	id,
	chosen,
	inputRef,
	onPick,
}: {
	id: string
	chosen: readonly string[]
	inputRef: RefObject<HTMLInputElement | null>
	onPick: (code: string) => void
}) {
	const list = useId()
	const [text, setText] = useState('')
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(-1)
	const matches = matchingCountries(text, { sans: chosen, avecFrance: true })
	const isOpen = open && matches.length > 0

	function pick(code: string) {
		setText('')
		setOpen(false)
		setActive(-1)
		onPick(code)
	}

	function onKey(evenement: KeyboardEvent<HTMLInputElement>) {
		const { key } = evenement
		if (key === 'ArrowDown' || key === 'ArrowUp') {
			if (matches.length === 0) return
			evenement.preventDefault()
			const delta = key === 'ArrowDown' ? 1 : -1
			setOpen(true)
			setActive(courant => (courant + delta + matches.length) % matches.length)
		} else if (key === 'Enter' && isOpen) {
			// The form is not sent by this Enter.
			evenement.preventDefault()
			const chosenOne = active >= 0 ? matches[active] : matches.length === 1 ? matches[0] : undefined
			if (chosenOne) pick(chosenOne.code)
		} else if (key === 'Escape' && isOpen) {
			evenement.preventDefault()
			evenement.stopPropagation()
			setOpen(false)
			setActive(-1)
		}
	}

	const status = isOpen
		? `${matches.length} pays proposé${matches.length > 1 ? 's' : ''}.`
		: text.trim().length >= 2 && matches.length === 0
			? 'Aucun pays ne correspond.'
			: ''

	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="font-medium text-sm">
				Ajouter un pays
			</label>
			<input
				id={id}
				ref={inputRef}
				type="text"
				role="combobox"
				aria-expanded={isOpen}
				aria-controls={list}
				aria-autocomplete="list"
				aria-activedescendant={isOpen && active >= 0 ? `${list}-${active}` : undefined}
				autoComplete="off"
				autoCapitalize="off"
				spellCheck={false}
				value={text}
				onChange={evenement => {
					setText(evenement.target.value)
					setOpen(true)
					setActive(-1)
				}}
				onKeyDown={onKey}
				onBlur={() => {
					setOpen(false)
					setActive(-1)
				}}
				className={FIELD}
			/>
			<p role="status" className="text-neutral-700 text-sm">
				{status}
			</p>
			<div
				id={list}
				role="listbox"
				aria-label="Pays proposés"
				hidden={!isOpen}
				className="flex flex-col overflow-hidden rounded-md border border-neutral-300 bg-white"
			>
				{matches.map((country, rang) => (
					// biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard works the options from the field (aria-activedescendant)
					<div
						key={country.code}
						id={`${list}-${rang}`}
						role="option"
						tabIndex={-1}
						aria-selected={rang === active}
						onMouseDown={evenement => evenement.preventDefault()}
						onClick={() => pick(country.code)}
						className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-base ${
							rang === active ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
						}`}
					>
						<span aria-hidden="true">{flag(country.code)}</span>
						{country.name}
					</div>
				))}
			</div>
		</div>
	)
}
