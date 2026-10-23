/**
 * The specialty of a makeup artist, chosen from bullets with « Autre » for a free text (ticket 1010).
 *
 * The profile stores the chosen bullets (`specialtyBullets`) and the free text (`specialtyOther`), and
 * the text shown everywhere (`specialty`: cards, title, structured data, search by word) is composed
 * from the two. One rule, here: the collection, the import and the forms all call it.
 */

export const SPECIALTY_BULLETS = [
	{ value: 'wedding', label: 'Mariage' },
	{ value: 'event', label: 'Soirée et événement' },
	{ value: 'photoFashion', label: 'Photo et mode' },
	{ value: 'screenStage', label: 'Cinéma et scène' },
	{ value: 'specialEffects', label: 'Effets spéciaux' },
	{ value: 'selfMakeupCourse', label: 'Cours d’auto-maquillage' },
] as const

export type SpecialtyBullet = (typeof SPECIALTY_BULLETS)[number]['value']

export const SPECIALTY_VALUES: readonly SpecialtyBullet[] = SPECIALTY_BULLETS.map(bullet => bullet.value)

/** The longest « Autre » text, as the old free specialty. */
export const SPECIALTY_OTHER_MAX = 70

/** The longest composed text: all the bullets and a full « Autre ». */
export const SPECIALTY_MAX = 200

const SEPARATOR = ', '

const isBullet = (value: unknown): value is SpecialtyBullet =>
	typeof value === 'string' && SPECIALTY_VALUES.some(known => known === value)

/** The known bullets of a list, once each, in the order of the list of bullets. */
export function normalizeBullets(values: readonly unknown[] | null | undefined): SpecialtyBullet[] {
	const chosen = new Set((values ?? []).filter(isBullet))
	return SPECIALTY_VALUES.filter(value => chosen.has(value))
}

/** The bullets of a form value: keys joined by a comma (the forms keep texts only). */
export function parseSpecialtyBullets(joined: string): SpecialtyBullet[] {
	return normalizeBullets(joined.split(','))
}

export const joinSpecialtyBullets = (values: readonly SpecialtyBullet[]): string => values.join(',')

const labelOf = (value: SpecialtyBullet): string =>
	SPECIALTY_BULLETS.find(bullet => bullet.value === value)?.label ?? ''

/** The text shown: the labels of the bullets, then the free text. */
export function composeSpecialty(
	bullets: readonly unknown[] | null | undefined,
	other: string | null | undefined
): string {
	const labels = normalizeBullets(bullets).map(labelOf)
	// Not trimmed here: the forms trim, and an existing text must come back as it was.
	const free = other ?? ''
	return [...labels, ...(free ? [free] : [])].join(SEPARATOR)
}

/**
 * An existing free text, ranged without loss: a text that is exactly one bullet, or bullets joined by a
 * comma in the order of the list, becomes those bullets; any other text stays whole in « Autre ».
 * Recomposing the result gives the text back, so a second pass changes nothing.
 */
export function splitLegacySpecialty(text: string | null | undefined): { bullets: SpecialtyBullet[]; other: string } {
	const source = text ?? ''
	if (source === '') return { bullets: [], other: '' }
	const parts = source.split(SEPARATOR)
	const bullets = SPECIALTY_BULLETS.filter(bullet => parts.includes(bullet.label)).map(bullet => bullet.value)
	if (bullets.length === parts.length && composeSpecialty(bullets, '') === source) return { bullets, other: '' }
	return { bullets: [], other: source }
}

interface SpecialtyFields {
	specialty?: string | null
	specialtyBullets?: readonly unknown[] | null
	specialtyOther?: string | null
}

/**
 * What a save of a profile writes for the specialty. Payload hands the hook the whole document, so the
 * fields are compared with the stored ones to know which the caller changed. The shown text is always
 * composed here, so the three fields never disagree:
 * - the bullets or the « Autre » text changed: the text is composed from them;
 * - only the text changed (the administration, an older caller) and it is not what the stored fields
 *   compose: it is ranged like an existing text (`splitLegacySpecialty`);
 * - nothing changed: nothing is written.
 */
export function specialtyPatch(data: SpecialtyFields, stored: SpecialtyFields | null | undefined): SpecialtyFields {
	const bullets = normalizeBullets(
		data.specialtyBullets !== undefined ? data.specialtyBullets : stored?.specialtyBullets
	)
	const other = (data.specialtyOther !== undefined ? data.specialtyOther : stored?.specialtyOther) ?? ''
	const storedBullets = normalizeBullets(stored?.specialtyBullets)
	const storedOther = stored?.specialtyOther ?? ''
	const created = stored == null && (data.specialtyBullets !== undefined || data.specialtyOther !== undefined)
	// An empty text is stored as nothing, as the import reads it from the old site.
	if (created || bullets.join() !== storedBullets.join() || other !== storedOther)
		return {
			specialty: composeSpecialty(bullets, other) || null,
			specialtyBullets: bullets,
			specialtyOther: other || null,
		}
	if (data.specialty === undefined || (data.specialty ?? '') === (stored?.specialty ?? '')) return {}
	const text = data.specialty ?? ''
	if (text === composeSpecialty(storedBullets, storedOther)) return {}
	const legacy = splitLegacySpecialty(text)
	return { specialtyBullets: legacy.bullets, specialtyOther: legacy.other || null }
}

/**
 * The specialty of a stored profile as the forms hold it: the bullets joined, and the « Autre » text. A
 * profile written before the bullets existed (nothing in either field, a shown text) shows its text in
 * « Autre », so the form never opens empty on a specialty she has.
 */
export function specialtyFormValues(stored: SpecialtyFields): { specialtyBullets: string; specialtyOther: string } {
	const bullets = normalizeBullets(stored.specialtyBullets)
	const other = stored.specialtyOther ?? ''
	if (bullets.length === 0 && other === '') return { specialtyBullets: '', specialtyOther: stored.specialty ?? '' }
	return { specialtyBullets: joinSpecialtyBullets(bullets), specialtyOther: other }
}
