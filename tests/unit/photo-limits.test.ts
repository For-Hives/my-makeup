import { describe, expect, test } from 'bun:test'
import {
	megabytes,
	photoLimitsFrom,
	photosLeft,
	quotaVerdict,
	settingInvalid,
	settingValue,
	uploadRequestSizeMax,
	usageSentence,
	usageView,
} from '@/lib/photo-limits'

/** What a profile may store (ticket 309): the settings, the verdict on a new photo, the sentence of her space. */

const MIB = 1024 * 1024
const limits = photoLimitsFrom({})

describe('les réglages : variables d’environnement avec défaut', () => {
	test('par défaut : 12 Mo par envoi, 45 photos et 60 Mo par profil, WebP à 82, grand côté 2000 px', () => {
		expect(limits).toEqual({
			uploadBytes: 12 * MIB,
			profileCount: 45,
			profileBytes: 60 * MIB,
			webpQuality: 82,
			sidePx: 2000,
		})
	})

	test('une valeur valide change le réglage, sans autre code', () => {
		expect(photoLimitsFrom({ PHOTO_PROFILE_MAX_COUNT: '10', PHOTO_PROFILE_MAX_MB: '5' })).toMatchObject({
			profileCount: 10,
			profileBytes: 5 * MIB,
		})
	})

	test('une valeur illisible ou hors bornes redonne le défaut (le démarrage la refuse, voir env.ts)', () => {
		expect(photoLimitsFrom({ PHOTO_WEBP_QUALITY: '150', PHOTO_SIDE_MAX_PX: 'grand' })).toMatchObject({
			webpQuality: 82,
			sidePx: 2000,
		})
		expect(settingValue('PHOTO_WEBP_QUALITY', '95')).toBe(95)
		expect(settingValue('PHOTO_WEBP_QUALITY', '96')).toBeUndefined()
		expect(settingInvalid('PHOTO_WEBP_QUALITY', '  ')).toBe(false)
		expect(settingInvalid('PHOTO_WEBP_QUALITY', '96')).toBe(true)
	})

	test('le corps d’une requête d’envoi : le fichier plus la marge du multipart', () => {
		expect(uploadRequestSizeMax(limits)).toBe(13 * MIB)
	})
})

describe('quotaVerdict : une photo de plus dans un profil', () => {
	const usage = { count: 10, bytes: 20 * MIB }

	test('sous les deux limites : acceptée', () => {
		expect(quotaVerdict({ usage, addedBytes: MIB, replacing: false, limits })).toEqual({ ok: true })
	})

	test('au nombre maximal : refusée avec la limite nommée, même pour une photo légère', () => {
		const verdict = quotaVerdict({ usage: { count: 45, bytes: MIB }, addedBytes: 1000, replacing: false, limits })
		expect(verdict.ok).toBe(false)
		if (!verdict.ok) expect(verdict.message).toContain('limite de 45 photos')
	})

	test('un octet de trop sur le volume : refusée ; pile à la limite : acceptée', () => {
		const full = { count: 3, bytes: 60 * MIB - 100 }
		expect(quotaVerdict({ usage: full, addedBytes: 100, replacing: false, limits })).toEqual({ ok: true })
		const verdict = quotaVerdict({ usage: full, addedBytes: 101, replacing: false, limits })
		expect(verdict.ok).toBe(false)
		if (!verdict.ok) expect(verdict.message).toContain('60 Mo')
	})

	test('un profil déjà au-dessus de la limite n’ajoute rien tant qu’il n’est pas repassé dessous', () => {
		const over = { count: 50, bytes: 70 * MIB }
		expect(quotaVerdict({ usage: over, addedBytes: 1, replacing: false, limits }).ok).toBe(false)
		// Back under the count and the volume: it adds again.
		expect(quotaVerdict({ usage: { count: 44, bytes: 50 * MIB }, addedBytes: MIB, replacing: false, limits }).ok).toBe(
			true
		)
	})

	test('un réglage abaissé s’applique au profil existant', () => {
		const low = photoLimitsFrom({ PHOTO_PROFILE_MAX_COUNT: '5' })
		expect(quotaVerdict({ usage: { count: 5, bytes: MIB }, addedBytes: 1, replacing: false, limits: low }).ok).toBe(
			false
		)
	})

	test('le remplacement d’un fichier ne compte pas une photo de plus, seulement le volume', () => {
		const atCount = { count: 45, bytes: 10 * MIB }
		expect(quotaVerdict({ usage: atCount, addedBytes: MIB, replacing: true, limits }).ok).toBe(true)
		expect(quotaVerdict({ usage: { count: 45, bytes: 60 * MIB }, addedBytes: MIB, replacing: true, limits }).ok).toBe(
			false
		)
	})
})

describe('la phrase de son espace', () => {
	test('megabytes : une décimale au plus, une virgule', () => {
		expect([megabytes(0), megabytes(MIB), megabytes(1.5 * MIB), megabytes(60 * MIB)]).toEqual(['0', '1', '1,5', '60'])
	})

	test('« il te reste N photos »', () => {
		const view = usageView({ count: 14, bytes: 12.3 * MIB }, limits)
		expect(photosLeft(view)).toBe(31)
		expect(usageSentence(view)).toBe('Tes photos prennent 12,3 Mo sur 60 Mo. Il te reste 31 photos.')
		expect(usageSentence(usageView({ count: 44, bytes: MIB }, limits))).toContain('Il te reste 1 photo.')
	})

	test('à la limite : le message dit quoi faire ; au-dessus : zéro restante, jamais négatif', () => {
		for (const usage of [
			{ count: 45, bytes: MIB },
			{ count: 3, bytes: 60 * MIB },
			{ count: 60, bytes: 80 * MIB },
		]) {
			const view = usageView(usage, limits)
			expect(photosLeft(view)).toBeGreaterThanOrEqual(0)
			expect(usageSentence(view)).toContain('Tu as atteint la limite')
		}
	})
})
