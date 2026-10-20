import { describe, expect, test } from 'bun:test'
import {
	formatAmount,
	formatFrom,
	formatPrice,
	isPriceAmount,
	minimumPrice,
	PRICE_MAX,
	PRICE_MIN,
	parsePrice,
	priceRows,
} from '@/lib/price'
import jeu from './fixtures/prix-ancien-site.json'

// The two spaces of an amount, written as escapes so that a regular space can never pass for them
const INSECABLE = '\u00a0'
const FINE = '\u202f'

/** What the site shows for a text typed in a price field. */
const affiche = (saisie: unknown) => formatPrice(parsePrice(saisie))

const INTERDIT = /NaN|null|undefined|Infinity|^\s*€|-\d/

describe('parsePrice and formatPrix (plans/02 U33-U36)', () => {
	test('U33 « 50 », « 50€ », « 50 € » → 50, shown « 50 € » with a no-break space', () => {
		for (const saisie of ['50', '50€', '50 €', `50${INSECABLE}€`, ' 50 € ', '50 euros']) {
			expect(parsePrice(saisie).priceFrom, saisie).toBe(50)
			expect(affiche(saisie), saisie).toBe(`50${INSECABLE}€`)
		}
		// the text typed is kept next to the amount, trimmed
		expect(parsePrice(' 50€ ')).toEqual({ priceFrom: 50, priceText: '50€' })
		expect(affiche('50')).not.toContain(' ')
	})

	test('U34 « 1200 » → « 1 200 € », « 50,5 » → « 50,50 € »', () => {
		expect(parsePrice('1200').priceFrom).toBe(1200)
		expect(affiche('1200')).toBe(`1${FINE}200${INSECABLE}€`)
		expect(affiche('1 200 €')).toBe(`1${FINE}200${INSECABLE}€`)
		expect(parsePrice('50,5').priceFrom).toBe(50.5)
		expect(affiche('50,5')).toBe(`50,50${INSECABLE}€`)
		expect(affiche('50.5 €')).toBe(`50,50${INSECABLE}€`)
		expect(affiche('1 200,5 €')).toBe(`1${FINE}200,50${INSECABLE}€`)
	})

	test('U35 « à partir de 80 » → 80, shown « À partir de 80 € »', () => {
		for (const saisie of ['à partir de 80', 'À partir de 80 €', 'A partir de 80€', 'a partir de : 80 euros']) {
			expect(parsePrice(saisie).priceFrom, saisie).toBe(80)
			expect(affiche(saisie), saisie).toBe(`À partir de 80${INSECABLE}€`)
		}
		expect(parsePrice('à partir de 80')).toEqual({ priceFrom: 80, priceText: 'à partir de 80' })
		// « à » typed as a letter and a combining accent
		expect(affiche('a\u0300 partir de 80')).toBe(`À partir de 80${INSECABLE}€`)
		expect(affiche('À PARTIR DE 1 200 €')).toBe(`À partir de 1${FINE}200${INSECABLE}€`)
	})

	test('U36 free text (« sur devis »): no amount, the text kept, never « NaN € »', () => {
		expect(parsePrice('sur devis')).toEqual({ priceFrom: null, priceText: 'sur devis' })
		expect(affiche('sur devis')).toBe('Sur devis')
		expect(parsePrice('  Me contacter ')).toEqual({ priceFrom: null, priceText: 'Me contacter' })
		expect(affiche('SUR DEVIS')).toBe('SUR DEVIS')
		expect(affiche('étudiante : me contacter')).toBe('Étudiante : me contacter')
		for (const saisie of ['sur devis', 'gratuit', '-', 'devis', '2', '15000 €', 'NaN', 'zéro']) {
			expect(parsePrice(saisie).priceFrom, saisie).toBeNull()
			expect(affiche(saisie), saisie).not.toMatch(INTERDIT)
		}
	})

	test('nothing typed: no amount, no text, nothing shown', () => {
		const rien = { priceFrom: null, priceText: null }
		const sansTexte = ['', '   ', '\n', 'null', 'undefined', 'NaN', ' Null ']
		const pasUnTexte = [null, undefined, 80, Number.NaN, {}, []]
		for (const saisie of [...sansTexte, ...pasUnTexte]) {
			expect(parsePrice(saisie), String(saisie)).toEqual(rien)
			expect(affiche(saisie), String(saisie)).toBe('')
		}
	})

	test('a number out of 5 to 10 000 is not an amount, and its text stays', () => {
		expect(PRICE_MIN).toBe(5)
		expect(PRICE_MAX).toBe(10_000)
		expect(parsePrice('4,99')).toEqual({ priceFrom: null, priceText: '4,99' })
		expect(parsePrice('5').priceFrom).toBe(5)
		expect(parsePrice('10 000 €').priceFrom).toBe(10_000)
		expect(parsePrice('10 001 €')).toEqual({ priceFrom: null, priceText: '10 001 €' })
		expect(isPriceAmount(5)).toBe(true)
		expect(isPriceAmount(10_000)).toBe(true)
		for (const v of [4.99, 10_000.01, 0, -80, Number.NaN, Number.POSITIVE_INFINITY, '80', null, undefined]) {
			expect(isPriceAmount(v), String(v)).toBe(false)
		}
	})
})

describe('the same amounts as the old site', () => {
	test('the shared fictional set: prixNumerique of the branch main and parsePrice agree', () => {
		expect(jeu.cas.length).toBeGreaterThanOrEqual(80)
		for (const { saisie, montantAttendu } of jeu.cas) {
			expect(parsePrice(saisie).priceFrom, JSON.stringify(saisie)).toBe(montantAttendu)
		}
	})

	// Ported from « numeric price read in the text » of tests/unit/completude.test.mjs (branch main)
	test('the cases of the old test', () => {
		expect(parsePrice('80€').priceFrom).toBe(80)
		expect(parsePrice('à partir de 82,50 €').priceFrom).toBe(82.5)
		expect(parsePrice('1 200 €').priceFrom).toBe(1200)
		expect(parsePrice('Sur devis').priceFrom).toBeNull()
		expect(parsePrice('2').priceFrom).toBeNull()
		expect(parsePrice(null).priceFrom).toBeNull()
	})

	test('whatever the text, what is shown is never « NaN € » nor blank lines', () => {
		for (const { saisie } of jeu.cas) {
			const lignes = priceRows(parsePrice(saisie))
			for (const ligne of lignes) {
				expect(ligne, JSON.stringify(saisie)).not.toMatch(INTERDIT)
				expect(ligne.trim(), JSON.stringify(saisie)).toBe(ligne)
				expect(ligne, JSON.stringify(saisie)).not.toBe('')
			}
			expect(lignes.length > 0, JSON.stringify(saisie)).toBe(parsePrice(saisie).priceText !== null)
		}
	})
})

describe('formatMontant and formatAPartirDe', () => {
	test('euros, a thin no-break space every three digits, cents only when there are some', () => {
		expect(formatAmount(50)).toBe(`50${INSECABLE}€`)
		expect(formatAmount(999)).toBe(`999${INSECABLE}€`)
		expect(formatAmount(1000)).toBe(`1${FINE}000${INSECABLE}€`)
		expect(formatAmount(1200)).toBe(`1${FINE}200${INSECABLE}€`)
		expect(formatAmount(1234567.5)).toBe(`1${FINE}234${FINE}567,50${INSECABLE}€`)
		expect(formatAmount(50.5)).toBe(`50,50${INSECABLE}€`)
		expect(formatAmount(49.99)).toBe(`49,99${INSECABLE}€`)
		expect(formatAmount(80.05)).toBe(`80,05${INSECABLE}€`)
		expect(formatAmount(82.555)).toBe(`82,56${INSECABLE}€`)
		expect(formatAmount(49.999)).toBe(`50${INSECABLE}€`)
		expect(formatAmount(0.5)).toBe(`0,50${INSECABLE}€`)
	})

	test('never « NaN € »: nothing for what is not an amount above zero', () => {
		const pasUnMontant = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0, -80, 0.004, 1e21, null]
		for (const v of [...pasUnMontant, undefined, '80' as unknown as number]) {
			expect(formatAmount(v), String(v)).toBe('')
			expect(formatFrom(v), String(v)).toBe('')
		}
	})

	test('« À partir de 80 € » for a card', () => {
		expect(formatFrom(80)).toBe(`À partir de 80${INSECABLE}€`)
		expect(formatFrom(1200)).toBe(`À partir de 1${FINE}200${INSECABLE}€`)
	})
})

describe('lignesDePrix: nothing typed is lost, nothing is said twice', () => {
	test('one entry per line typed, blank lines and « null » left out', () => {
		expect(priceRows(parsePrice('Mariée : 150 €\nInvitée : 60 €'))).toEqual(['Mariée : 150 €', 'Invitée : 60 €'])
		expect(priceRows(parsePrice('50€\n\n  à partir de 80  \r\nnull\nsur devis\n'))).toEqual([
			`50${INSECABLE}€`,
			`À partir de 80${INSECABLE}€`,
			'Sur devis',
		])
		expect(formatPrice(parsePrice('50€\nsur devis'))).toBe(`50${INSECABLE}€\nSur devis`)
	})

	test('a line that says more than an amount stays as typed', () => {
		for (const saisie of ['80 € par personne', '45 min, 60 €', '150 € TTC', 'Dès 60 €', '1.200 €', '12 50 €', '0 €']) {
			expect(affiche(saisie), saisie).toBe(saisie)
		}
		expect(affiche('forfait 250 €')).toBe('Forfait 250 €')
		// a small amount alone is still written as an amount, even if it does not count as a price
		expect(parsePrice('2€').priceFrom).toBeNull()
		expect(affiche('2€')).toBe(`2${INSECABLE}€`)
		expect(affiche('15000 €')).toBe(`15${FINE}000${INSECABLE}€`)
	})

	test('an amount stored without a text', () => {
		expect(priceRows({ priceFrom: 80 })).toEqual([`80${INSECABLE}€`])
		expect(priceRows({ priceFrom: 1200, priceText: null })).toEqual([`1${FINE}200${INSECABLE}€`])
		expect(priceRows({ priceFrom: 80, priceText: '  ' })).toEqual([`80${INSECABLE}€`])
	})

	test('an amount stored next to a free text: both are shown, the amount first', () => {
		expect(priceRows({ priceFrom: 80, priceText: 'essai inclus' })).toEqual([`80${INSECABLE}€`, 'Essai inclus'])
		expect(priceRows({ priceFrom: 90, priceText: 'à partir de 80' })).toEqual([
			`90${INSECABLE}€`,
			`À partir de 80${INSECABLE}€`,
		])
	})

	test('an amount the text gives already is shown once', () => {
		expect(priceRows({ priceFrom: 80, priceText: '80 €' })).toEqual([`80${INSECABLE}€`])
		expect(priceRows({ priceFrom: 82.5, priceText: 'à partir de 82,50 €' })).toEqual([`À partir de 82,50${INSECABLE}€`])
		expect(priceRows({ priceFrom: 150, priceText: 'Mariée : 150 €\nInvitée : 60 €' })).toHaveLength(2)
		expect(priceRows({ priceFrom: 3, priceText: '3 €' })).toEqual([`3${INSECABLE}€`])
	})

	test('whatever is stored, nothing absurd is shown', () => {
		const montants = [Number.NaN, Number.POSITIVE_INFINITY, -80, 0, null, undefined, '80' as unknown as number]
		const textes = [null, undefined, '', '   ', '\n\n', 'null', 'undefined', 'NaN', 42 as unknown as string]
		for (const priceFrom of montants) {
			for (const priceText of textes) {
				expect(priceRows({ priceFrom, priceText }), `${priceFrom} / ${priceText}`).toEqual([])
			}
			expect(formatPrice({ priceFrom, priceText: 'sur devis' }), String(priceFrom)).toBe('Sur devis')
		}
		expect(priceRows(null)).toEqual([])
		expect(priceRows(undefined)).toEqual([])
		expect(formatPrice({})).toBe('')
	})
})

describe('prixMinimal (plans/02 U37)', () => {
	test('U37 the lowest amount of the offers, for the JSON-LD and the cards', () => {
		const prestations = ['à partir de 120 €', '80€', '1 200 €', '82,50'].map(parsePrice)
		expect(minimumPrice(prestations)).toBe(80)
		expect(formatFrom(minimumPrice(prestations))).toBe(`À partir de 80${INSECABLE}€`)
		expect(minimumPrice([{ priceFrom: 150 }])).toBe(150)
		expect(minimumPrice([{ priceFrom: 49.99 }, { priceFrom: 50 }])).toBe(49.99)
	})

	test('U37 offers in free text are ignored', () => {
		expect(minimumPrice(['sur devis', 'à partir de 120 €', 'Me contacter'].map(parsePrice))).toBe(120)
		expect(minimumPrice(['sur devis', 'gratuit', '2'].map(parsePrice))).toBeNull()
		// a free text that holds small numbers gives no amount, so it cannot become the lowest price
		expect(minimumPrice(['2 h : 150 €', '90 €'].map(parsePrice))).toBe(90)
	})

	test('U37 no offer, or nothing usable: no lowest price', () => {
		expect(minimumPrice([])).toBeNull()
		expect(minimumPrice(null)).toBeNull()
		expect(minimumPrice(undefined)).toBeNull()
		expect(minimumPrice([null, undefined, {}, { priceFrom: null }])).toBeNull()
	})

	test('U37 an amount out of bounds is not a price', () => {
		const horsBornes = [Number.NaN, Number.POSITIVE_INFINITY, -80, 0, 4.99, 10_000.01, '60' as unknown as number]
		expect(minimumPrice(horsBornes.map(priceFrom => ({ priceFrom })))).toBeNull()
		expect(minimumPrice([...horsBornes.map(priceFrom => ({ priceFrom })), { priceFrom: 95 }])).toBe(95)
	})

	test('U37 the options of an offer do not count: an option is not sold alone', () => {
		const prestations = [
			{ nom: 'Mariée', priceFrom: 150, options: [{ nom: 'Faux cils', priceFrom: 10 }] },
			{ nom: 'Soirée', priceFrom: null, priceText: 'sur devis', options: [{ nom: 'Essai', priceFrom: 40 }] },
		]
		expect(minimumPrice(prestations)).toBe(150)
	})
})
