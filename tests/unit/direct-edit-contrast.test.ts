import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { DIMMED_OPACITY } from '@/components/direct-edit/EditableBlock'

/**
 * The contrast of the colours of her page in edit mode (issue 1071): read from the one place where they are
 * defined (`@theme` of src/app/(front)/globals.css), never copied here. Current text is asked 7:1, secondary text
 * and the accent used as text 4.5:1, borders of fields and icons 3:1, in the states normal, hover, focus,
 * editing, error and disabled.
 */

const css = readFileSync(new URL('../../src/app/(front)/globals.css', import.meta.url), 'utf8')
const token = (name: string): string => {
	const found = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
	if (!found?.[1]) throw new Error(`jeton ${name} absent de globals.css`)
	return found[1]
}
const channels = (hex: string): [number, number, number] => {
	const n = Number.parseInt(hex.slice(1), 16)
	return [n >> 16, (n >> 8) & 255, n & 255]
}
const linear = (c: number): number => {
	const x = c / 255
	return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string): number => {
	const [r, g, b] = channels(hex)
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
export const contrast = (a: string, b: string): number => {
	const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
	return (high + 0.05) / (low + 0.05)
}
/** `front` laid at `alpha` over `back`: what a dimmed block shows. */
const mix = (front: string, back: string, alpha: number): string => {
	const f = channels(front)
	const b = channels(back)
	return `#${f
		.map((c, i) =>
			Math.round(c * alpha + (b[i] as number) * (1 - alpha))
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`
}

const SURFACES = ['white', 'page', 'blush', 'nude-100'] as const
const hex = (name: string): string => (name === 'white' ? '#ffffff' : token(name))

// [state, foreground, background, minimum, what it is]
const CURRENT = 7
const SECONDARY = 4.5
const GRAPHIC = 3
const PAIRS: [string, string, string, number, string][] = [
	...SURFACES.flatMap((surface): [string, string, string, number, string][] => [
		['normal', 'ink', surface, CURRENT, 'texte courant'],
		['normal', 'mute', surface, CURRENT, 'texte secondaire, libellés, aides, compteurs'],
		['normal', 'lipstick-800', surface, CURRENT, 'texte rouge (titre du bloc, erreurs)'],
		['normal', 'ok', surface, CURRENT, 'état « enregistré »'],
		['normal', 'warm', surface, CURRENT, 'état « en cours »'],
	]),
	['normal', 'lipstick', 'white', SECONDARY, 'rouge à lèvres en texte'],
	['normal', 'lipstick', 'page', SECONDARY, 'rouge à lèvres en texte'],
	['normal', 'nude-300', 'white', GRAPHIC, 'contour d’un champ sur une carte'],
	['normal', 'nude-300', 'blush', GRAPHIC, 'contour d’un champ sur une surface secondaire'],
	['normal', 'nude-300', 'page', GRAPHIC, 'contour du crayon et de l’invitation'],
	['normal', 'ink', 'white', GRAPHIC, 'icône du crayon'],
	['hover', 'white', 'lipstick-800', CURRENT, 'crayon « Modifier » au survol'],
	['hover', 'lipstick', 'white', GRAPHIC, 'halo de survol sur une carte'],
	['hover', 'lipstick', 'page', GRAPHIC, 'halo de survol sur la page'],
	['hover', 'ink', 'nude-100', CURRENT, 'bouton Annuler au survol'],
	['focus', 'lipstick', 'white', GRAPHIC, 'contour de focus d’un champ'],
	['focus', 'lipstick', 'page', GRAPHIC, 'halo de focus'],
	['editing', 'lipstick', 'white', GRAPHIC, 'contour de l’éditeur ouvert'],
	['editing', 'white', 'lipstick', SECONDARY, 'bouton Enregistrer'],
	['editing', 'lipstick-800', 'white', CURRENT, 'titre « Tu modifies : … »'],
	['error', 'lipstick-800', 'lipstick-50', CURRENT, 'message d’erreur'],
	['error', 'lipstick-800', 'white', GRAPHIC, 'contour du message d’erreur'],
	['disabled', 'mute', 'nude-200', CURRENT, 'bouton désactivé (texte)'],
	['disabled', 'nude-300', 'white', GRAPHIC, 'bouton désactivé (contour)'],
]

describe('les contrastes de l’édition directe', () => {
	for (const [state, front, back, minimum, what] of PAIRS) {
		test(`${state} : ${what} (${front} sur ${back}) au moins ${minimum}:1`, () => {
			expect(contrast(hex(front), hex(back))).toBeGreaterThanOrEqual(minimum)
		})
	}

	test('un bloc estompé reste lisible : le texte courant garde 7:1, le secondaire 4,5:1', () => {
		for (const back of ['page', 'white'] as const) {
			const ground = hex(back)
			expect(contrast(mix(token('ink'), ground, DIMMED_OPACITY), ground)).toBeGreaterThanOrEqual(CURRENT)
			expect(contrast(mix(token('mute'), ground, DIMMED_OPACITY), ground)).toBeGreaterThanOrEqual(SECONDARY)
		}
	})

	test('le fond de la page est un blanc cassé très léger, les cartes sont blanches', () => {
		const [r, g, b] = channels(token('page'))
		expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(0xf5)
		expect(contrast(token('page'), '#ffffff')).toBeLessThan(1.1)
	})
})
