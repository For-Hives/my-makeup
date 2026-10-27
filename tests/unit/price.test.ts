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
import jeu from './fixtures/price-old-site.json'

// The two spaces of an amount, written as escapes so that a regular space can never pass for them
const NON_BREAKING = '\u00a0'
const FINE = '\u202f'

/** What the site shows for a text typed in a price field. */
const shown = (saisie: unknown) => formatPrice(parsePrice(saisie))

const FORBIDDEN = /NaN|null|undefined|Infinity|^\s*€|-\d/

describe('parsePrice and formatPrix (plans/02 U33-U36)', () => {
	test('U33 « 50 », « 50€ », « 50 € » → 50, shown « 50 € » with a no-break space', () => {
		for (const input of ['50', '50€', '50 €', `50${NON_BREAKING}€`, ' 50 € ', '50 euros']) {
			expect(parsePrice(input).priceFrom, input).toBe(50)
			expect(shown(input), input).toBe(`50${NON_BREAKING}€`)
		}
		// the text typed is kept next to the amount, trimmed
		expect(parsePrice(' 50€ ')).toEqual({ priceFrom: 50, priceText: '50€' })
		expect(shown('50')).not.toContain(' ')
	})

	test('U34 « 1200 » → « 1 200 € », « 50,5 » → « 50,50 € »', () => {
		expect(parsePrice('1200').priceFrom).toBe(1200)
		expect(shown('1200')).toBe(`1${FINE}200${NON_BREAKING}€`)
		expect(shown('1 200 €')).toBe(`1${FINE}200${NON_BREAKING}€`)
		expect(parsePrice('50,5').priceFrom).toBe(50.5)
		expect(shown('50,5')).toBe(`50,50${NON_BREAKING}€`)
		expect(shown('50.5 €')).toBe(`50,50${NON_BREAKING}€`)
		expect(shown('1 200,5 €')).toBe(`1${FINE}200,50${NON_BREAKING}€`)
	})

	test('U35 « à partir de 80 » → 80, shown « À partir de 80 € »', () => {
		for (const input of ['à partir de 80', 'À partir de 80 €', 'A partir de 80€', 'a partir de : 80 euros']) {
			expect(parsePrice(input).priceFrom, input).toBe(80)
			expect(shown(input), input).toBe(`À partir de 80${NON_BREAKING}€`)
		}
		expect(parsePrice('à partir de 80')).toEqual({ priceFrom: 80, priceText: 'à partir de 80' })
		// « à » typed as a letter and a combining accent
		expect(shown('a\u0300 partir de 80')).toBe(`À partir de 80${NON_BREAKING}€`)
		expect(shown('À PARTIR DE 1 200 €')).toBe(`À partir de 1${FINE}200${NON_BREAKING}€`)
	})

	test('U36 free text (« sur devis »): no amount, the text kept, never « NaN € »', () => {
		expect(parsePrice('sur devis')).toEqual({ priceFrom: null, priceText: 'sur devis' })
		expect(shown('sur devis')).toBe('Sur devis')
		expect(parsePrice('  Me contacter ')).toEqual({ priceFrom: null, priceText: 'Me contacter' })
		expect(shown('SUR DEVIS')).toBe('SUR DEVIS')
		expect(shown('étudiante : me contacter')).toBe('Étudiante : me contacter')
		for (const input of ['sur devis', 'gratuit', '-', 'devis', '2', '15000 €', 'NaN', 'zéro']) {
			expect(parsePrice(input).priceFrom, input).toBeNull()
			expect(shown(input), input).not.toMatch(FORBIDDEN)
		}
	})

	test('nothing typed: no amount, no text, nothing shown', () => {
		const nothing = { priceFrom: null, priceText: null }
		const withoutText = ['', '   ', '\n', 'null', 'undefined', 'NaN', ' Null ']
		const notText = [null, undefined, 80, Number.NaN, {}, []]
		for (const input of [...withoutText, ...notText]) {
			expect(parsePrice(input), String(input)).toEqual(nothing)
			expect(shown(input), String(input)).toBe('')
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

/**
 * The only cases where the v3 reads another amount than the old site, on purpose (decision of 27/10/2026): a
 * duration is not an amount. The old site read the first number, so the 45 of « 45 min, 60 € » and nothing
 * for « 2 h : 150 € » (its 2 is under the bound of 5).
 */
const DURATION_DIFFERENCES: Readonly<Record<string, number>> = {
	'45 min, 60 €': 60,
	'45min 60€': 60,
	'2 h : 150 €': 150,
	'2h : 150 €': 150,
}

describe('the same amounts as the old site', () => {
	test('the shared fictional set: prixNumerique of the branch main and parsePrice agree', () => {
		expect(jeu.cas.length).toBeGreaterThanOrEqual(80)
		for (const { saisie: input, montantAttendu: expectedAmount } of jeu.cas) {
			expect(parsePrice(input).priceFrom, JSON.stringify(input)).toBe(DURATION_DIFFERENCES[input] ?? expectedAmount)
		}
	})

	test('a duration is not an amount: the amount that follows is read', () => {
		for (const input of Object.keys(DURATION_DIFFERENCES)) {
			expect(
				jeu.cas.some(cas => cas.saisie === input),
				input
			).toBe(true)
		}
		const cases: [string, number | null][] = [
			['2 h : 150 €', 150],
			['2h30 : 150 €', 150],
			['2 h 30 : 150 €', 150],
			['1 heure : 80 euros', 80],
			['45 min, 60 €', 60],
			['45 minutes 60 euros', 60],
			['30 mn : 50 €', 50],
			['1 h 80 €', 80],
			['60 € / 30 min', 60],
			['50€/h', 50],
			['à partir de 80 € la séance de 1h', 80],
			['1 200 € pour 3 h', 1200],
			// a duration alone says no amount
			['Forfait 90 min', null],
			['2 h', null],
			['Sur devis, 2 h', null],
		]
		for (const [input, amount] of cases) {
			expect(parsePrice(input).priceFrom, input).toBe(amount)
		}
	})

	test('the amount shown is not said twice when it follows a duration', () => {
		expect(shown('2 h : 150 €')).toBe('2 h : 150 €')
		expect(priceRows(parsePrice('45 min, 60 €'))).toEqual(['45 min, 60 €'])
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
		for (const { saisie: input } of jeu.cas) {
			const lines = priceRows(parsePrice(input))
			for (const line of lines) {
				expect(line, JSON.stringify(input)).not.toMatch(FORBIDDEN)
				expect(line.trim(), JSON.stringify(input)).toBe(line)
				expect(line, JSON.stringify(input)).not.toBe('')
			}
			expect(lines.length > 0, JSON.stringify(input)).toBe(parsePrice(input).priceText !== null)
		}
	})
})

describe('formatMontant and formatAPartirDe', () => {
	test('euros, a thin no-break space every three digits, cents only when there are some', () => {
		expect(formatAmount(50)).toBe(`50${NON_BREAKING}€`)
		expect(formatAmount(999)).toBe(`999${NON_BREAKING}€`)
		expect(formatAmount(1000)).toBe(`1${FINE}000${NON_BREAKING}€`)
		expect(formatAmount(1200)).toBe(`1${FINE}200${NON_BREAKING}€`)
		expect(formatAmount(1234567.5)).toBe(`1${FINE}234${FINE}567,50${NON_BREAKING}€`)
		expect(formatAmount(50.5)).toBe(`50,50${NON_BREAKING}€`)
		expect(formatAmount(49.99)).toBe(`49,99${NON_BREAKING}€`)
		expect(formatAmount(80.05)).toBe(`80,05${NON_BREAKING}€`)
		expect(formatAmount(82.555)).toBe(`82,56${NON_BREAKING}€`)
		expect(formatAmount(49.999)).toBe(`50${NON_BREAKING}€`)
		expect(formatAmount(0.5)).toBe(`0,50${NON_BREAKING}€`)
	})

	test('never « NaN € »: nothing for what is not an amount above zero', () => {
		const notAmount = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -0, -80, 0.004, 1e21, null]
		for (const v of [...notAmount, undefined, '80' as unknown as number]) {
			expect(formatAmount(v), String(v)).toBe('')
			expect(formatFrom(v), String(v)).toBe('')
		}
	})

	test('« À partir de 80 € » for a card', () => {
		expect(formatFrom(80)).toBe(`À partir de 80${NON_BREAKING}€`)
		expect(formatFrom(1200)).toBe(`À partir de 1${FINE}200${NON_BREAKING}€`)
	})
})

describe('lignesDePrix: nothing typed is lost, nothing is said twice', () => {
	test('one entry per line typed, blank lines and « null » left out', () => {
		expect(priceRows(parsePrice('Mariée : 150 €\nInvitée : 60 €'))).toEqual(['Mariée : 150 €', 'Invitée : 60 €'])
		expect(priceRows(parsePrice('50€\n\n  à partir de 80  \r\nnull\nsur devis\n'))).toEqual([
			`50${NON_BREAKING}€`,
			`À partir de 80${NON_BREAKING}€`,
			'Sur devis',
		])
		expect(formatPrice(parsePrice('50€\nsur devis'))).toBe(`50${NON_BREAKING}€\nSur devis`)
	})

	test('a line that says more than an amount stays as typed', () => {
		for (const input of ['80 € par personne', '45 min, 60 €', '150 € TTC', 'Dès 60 €', '1.200 €', '12 50 €', '0 €']) {
			expect(shown(input), input).toBe(input)
		}
		expect(shown('forfait 250 €')).toBe('Forfait 250 €')
		// a small amount alone is still written as an amount, even if it does not count as a price
		expect(parsePrice('2€').priceFrom).toBeNull()
		expect(shown('2€')).toBe(`2${NON_BREAKING}€`)
		expect(shown('15000 €')).toBe(`15${FINE}000${NON_BREAKING}€`)
	})

	test('an amount stored without a text', () => {
		expect(priceRows({ priceFrom: 80 })).toEqual([`80${NON_BREAKING}€`])
		expect(priceRows({ priceFrom: 1200, priceText: null })).toEqual([`1${FINE}200${NON_BREAKING}€`])
		expect(priceRows({ priceFrom: 80, priceText: '  ' })).toEqual([`80${NON_BREAKING}€`])
	})

	test('an amount stored next to a free text: both are shown, the amount first', () => {
		expect(priceRows({ priceFrom: 80, priceText: 'essai inclus' })).toEqual([`80${NON_BREAKING}€`, 'Essai inclus'])
		expect(priceRows({ priceFrom: 90, priceText: 'à partir de 80' })).toEqual([
			`90${NON_BREAKING}€`,
			`À partir de 80${NON_BREAKING}€`,
		])
	})

	test('an amount the text gives already is shown once', () => {
		expect(priceRows({ priceFrom: 80, priceText: '80 €' })).toEqual([`80${NON_BREAKING}€`])
		expect(priceRows({ priceFrom: 82.5, priceText: 'à partir de 82,50 €' })).toEqual([
			`À partir de 82,50${NON_BREAKING}€`,
		])
		expect(priceRows({ priceFrom: 150, priceText: 'Mariée : 150 €\nInvitée : 60 €' })).toHaveLength(2)
		expect(priceRows({ priceFrom: 3, priceText: '3 €' })).toEqual([`3${NON_BREAKING}€`])
	})

	test('whatever is stored, nothing absurd is shown', () => {
		const amounts = [Number.NaN, Number.POSITIVE_INFINITY, -80, 0, null, undefined, '80' as unknown as number]
		const texts = [null, undefined, '', '   ', '\n\n', 'null', 'undefined', 'NaN', 42 as unknown as string]
		for (const priceFrom of amounts) {
			for (const priceText of texts) {
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
		const serviceOffers = ['à partir de 120 €', '80€', '1 200 €', '82,50'].map(parsePrice)
		expect(minimumPrice(serviceOffers)).toBe(80)
		expect(formatFrom(minimumPrice(serviceOffers))).toBe(`À partir de 80${NON_BREAKING}€`)
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
		const outsideBounded = [Number.NaN, Number.POSITIVE_INFINITY, -80, 0, 4.99, 10_000.01, '60' as unknown as number]
		expect(minimumPrice(outsideBounded.map(priceFrom => ({ priceFrom })))).toBeNull()
		expect(minimumPrice([...outsideBounded.map(priceFrom => ({ priceFrom })), { priceFrom: 95 }])).toBe(95)
	})

	test('U37 the options of an offer do not count: an option is not sold alone', () => {
		const serviceOffers = [
			{ nom: 'Mariée', priceFrom: 150, options: [{ nom: 'Faux cils', priceFrom: 10 }] },
			{ nom: 'Soirée', priceFrom: null, priceText: 'sur devis', options: [{ nom: 'Essai', priceFrom: 40 }] },
		]
		expect(minimumPrice(serviceOffers)).toBe(150)
	})
})
