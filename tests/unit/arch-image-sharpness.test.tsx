import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { ArchImage } from '../../src/components/art/ArchImage'
import { archSizes } from '../../src/components/art/arch-sizes'
import { SOURCE_ASPECTS } from '../../src/components/home/photo-aspects'

/**
 * Issue 1138: the photos of the home page, in an arch, were blurred. A landscape photo (3:2) in a portrait frame (4:5)
 * is covered by its HEIGHT: the width asked for the optimiser must be the frame's height times the photo's ratio, not
 * the frame's width, or the browser stretches a copy that is too small (1.7 times on a 2x screen). And Next encodes at
 * quality 75 unless the config lists another one.
 */
describe('tailles demandées pour une arche', () => {
	test('une photo en paysage demande la largeur qui couvre la hauteur de l’arche', () => {
		// 3:2 in a 4:5 frame: 1.5 / 0.8 = 1.875 times the frame's width.
		expect(archSizes({ desktop: 24, mobile: 20, sourceAspect: 1.5 })).toBe('(min-width: 768px) 45rem, 37.5rem')
	})

	test('une photo en portrait garde la largeur du cadre (rien à agrandir)', () => {
		expect(archSizes({ desktop: 24, mobile: 19, sourceAspect: 2 / 3 })).toBe('(min-width: 768px) 24rem, 19rem')
		expect(archSizes({ desktop: 24, mobile: 19 })).toBe('(min-width: 768px) 24rem, 19rem')
	})
})

describe('qualité des copies', () => {
	test('l’arche encode à 90 par défaut, et le réglage de Next en liste la valeur', () => {
		const config = readFileSync('next.config.ts', 'utf8')
		expect(config).toMatch(/qualities:\s*\[[^\]]*\b90\b[^\]]*\]/)
		expect(config).toMatch(/qualities:\s*\[[^\]]*\b75\b[^\]]*\]/)
		expect(readFileSync('src/components/art/ArchImage.tsx', 'utf8')).toContain('quality = 90')
		expect(renderToStaticMarkup(<ArchImage src="/assets/x.webp" alt="" />)).toContain('<img')
	})

	test('les images de la maison et de la carte de démonstration demandent 90', () => {
		for (const file of ['Presentation', 'Project', 'DemoCard']) {
			const source = readFileSync(`src/components/home/${file}.tsx`, 'utf8')
			expect(source).toContain('quality={90}')
		}
	})
})

describe('proportions déclarées des photos de la collaboration', () => {
	for (const [src, aspect] of Object.entries(SOURCE_ASPECTS)) {
		test(`${src} : le rapport déclaré est celui du fichier`, async () => {
			const { width, height } = await sharp(`public${src}`).metadata()
			expect(aspect).toBeCloseTo((width ?? 0) / (height ?? 1), 2)
		})
	}
})
