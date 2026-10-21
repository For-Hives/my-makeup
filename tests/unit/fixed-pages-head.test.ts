import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Ticket 274: the title and the description of the fixed pages are the ones of the old site (read on
// `main`, 21/10/2026), unless the register of intended changes says otherwise. Only the pages that
// the audit found different are listed here.

const OLD_HEAD: Record<string, { title: string; description?: string }> = {
	cgu: { title: "Conditions générales d'utilisation - My-Makeup" },
	contact: {
		title: 'Contact - My-Makeup',
		description:
			"Contactez-nous pour toute question, suggestion ou collaboration ! L'équipe My-Makeup est à votre écoute !",
	},
	'mentions-legales': { title: 'Mentions légales - My-Makeup' },
	'politique-de-confidentialite': { title: 'Politique de confidentialité - My-Makeup' },
	blog: {
		title: 'Blog de My-Makeup',
		description:
			"L'actualité de My-Makeup, ce que nous faisons pour améliorer votre quotidien ! Et les nouveautés qui arrivent bientôt !",
	},
	'maquilleuse/partenariats': { title: 'Communauté et partenariats !' },
	'particulier/centraliser-ses-recherches': { title: 'Centraliser ses recherches !' },
	'particulier/explorer-les-profils': { title: 'Explorer les profils !' },
	'particulier/trouver-une-maquilleuse': { title: 'Trouver une maquilleuse !' },
}

describe('274 : la tête des pages fixes reste celle de l’ancien site', () => {
	for (const [route, old] of Object.entries(OLD_HEAD)) {
		// The contact and blog pages import the Payload config, which reads its environment when loaded:
		// their source is read instead of the module.
		const readsPayload = route === 'contact' || route === 'blog'
		test(`/${route}`, async () => {
			if (readsPayload) {
				const source = readFileSync(path.join(process.cwd(), `src/app/(front)/(site)/${route}/page.tsx`), 'utf8')
				expect(source).toContain(`titre: '${old.title}',`)
				if (old.description) expect(source).toContain(JSON.stringify(old.description))
				return
			}
			const { metadata } = await import(`@/app/(front)/(site)/${route}/page`)
			expect((metadata.title as { absolute: string }).absolute).toBe(old.title)
			if (old.description) expect(metadata.description).toBe(old.description)
			// The share tags are the one improvement, written in the register (balises-sociales-pages-fixes).
			expect(metadata.openGraph?.title).toBe(old.title)
			expect(metadata.twitter?.card).toBe('summary_large_image')
		})
	}
})
