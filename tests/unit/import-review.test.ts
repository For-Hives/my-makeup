import { describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CaseToReview } from '../../scripts/migration/import/cities'
import { readableReviewPath, reviewAsMarkdown, writeReviewFiles } from '../../scripts/migration/import/review'

/**
 * Ticket 262: the list of review of the zones, written for a person. Fictional profiles only: the
 * text is compared with a text expected, and holds nothing typed, no `@`, no name of a person.
 */

const REVIEW: CaseToReview[] = [
	{
		profil: 82,
		motif: 'pas-une-commune',
		adresse: false,
		recherche: { nom: null, codePostal: null, departement: null, adresse: false },
		candidats: [],
	},
	{
		profil: 36,
		motif: 'code-postal-partage',
		adresse: false,
		recherche: { nom: null, codePostal: '62900', departement: null, adresse: false },
		candidats: [
			{ nom: 'Hameau-Un', code: '62901', departement: '62', codesPostaux: ['62900'] },
			{ nom: 'Hameau-Deux', code: '62902', departement: '62', codesPostaux: ['62900', '62901'] },
		],
	},
	{
		profil: 50,
		motif: 'homonymes',
		adresse: true,
		recherche: { nom: 'saint-exemple', codePostal: null, departement: '01', adresse: true },
		candidats: [{ nom: 'Saint-Exemple', code: '01901', departement: '01', codesPostaux: ['01990'] }],
	},
]

const EXPECTED = `# Zones à revoir

Liste privée, à lire par son seul propriétaire. Elle ne contient aucun texte saisi par une maquilleuse : seulement ce qui a été demandé au référentiel des communes (geo.api.gouv.fr) et les communes qu’il a données. Les profils sont désignés par leur numéro dans l’ancienne base.

3 profils à revoir. Chaque ligne proposée se copie telle quelle dans la table de décision (\`--decisions\`), sous « cities » ; la table garde une seule ligne par profil.

## Profil 36 : code postal partagé

Cherché : le code postal 62900.
Communes possibles :
- Hameau-Un (62), code INSEE 62901
- Hameau-Deux (62), code INSEE 62902

Pour trancher, ajoute à la table de décision, dans « cities », une seule de ces lignes :

\`\`\`json
{ "profile": 36, "inseeCode": "62901" }
{ "profile": 36, "inseeCode": "62902" }
{ "profile": 36, "inseeCode": null }
\`\`\`

- \`"inseeCode": null\` laisse la zone vide, et le profil n’est plus à revoir.

## Profil 50 : plusieurs communes portent ce nom

Le texte était une adresse postale : sa rue n’a jamais été lue ni gardée.

Cherché : le nom de commune « saint-exemple », le département 01.
Communes possibles :
- Saint-Exemple (01), code INSEE 01901

Pour trancher, ajoute à la table de décision, dans « cities », une seule de ces lignes :

\`\`\`json
{ "profile": 50, "inseeCode": "01901" }
{ "profile": 50, "inseeCode": null }
\`\`\`

- \`"inseeCode": null\` laisse la zone vide, et le profil n’est plus à revoir.

## Profil 82 : ce n’est pas une commune

Cherché : rien, le texte ne donne ni nom de commune ni code postal.
Communes possibles : aucune.

Pour trancher, ajoute à la table de décision, dans « cities », une seule de ces lignes :

\`\`\`json
{ "profile": 82, "inseeCode": null }
{ "profile": 82, "countries": ["XX"], "town": null }
\`\`\`

- \`"inseeCode": null\` laisse la zone vide, et le profil n’est plus à revoir.
- \`"countries"\` dit un à cinq pays par leur code ISO (BE, IT, CH…), dont un étranger ; \`"town"\` est le nom de la ville, seulement avec un seul pays étranger, sinon \`null\`. Remplace \`XX\` (qui est refusé tel quel) par les pays de la maquilleuse.
`

describe('ticket 262 : la liste de revue lisible', () => {
	test('un fichier .md à côté du JSON, quelle que soit l’extension donnée', () => {
		expect(readableReviewPath('revue.json')).toBe('revue.md')
		expect(readableReviewPath('/privé/v.json')).toBe('/privé/v.md')
		expect(readableReviewPath('v.txt')).toBe('v.md')
		expect(readableReviewPath('v')).toBe('v.md')
	})

	test('le texte d’une revue fictive est celui qui est attendu, rangé par profil', () => {
		expect(reviewAsMarkdown(REVIEW)).toBe(EXPECTED)
	})

	test('il ne contient ni @, ni texte saisi, ni nom de personne', () => {
		const text = reviewAsMarkdown(REVIEW)

		expect(text).not.toContain('@')
		expect(text).not.toMatch(/Pinceaux|impasse|France|Belgique|Italie/)
	})

	test('une revue vide le dit', () => {
		expect(reviewAsMarkdown([])).toContain('Aucun profil à revoir.')
	})

	test('un fichier écrit en mode 600 le reste, même quand il existait avant en mode plus ouvert', () => {
		const folder = mkdtempSync(path.join(tmpdir(), 'revue-lisible-'))
		try {
			const file = path.join(folder, 'v.md')
			writeFileSync(file, 'ancien', { mode: 0o644 })
			chmodSync(file, 0o644)
			writeReviewFiles(path.join(folder, 'v.json'), REVIEW)

			expect(statSync(file).mode & 0o777).toBe(0o600)
			expect(statSync(path.join(folder, 'v.json')).mode & 0o777).toBe(0o600)
			expect(readFileSync(file, 'utf8')).toBe(EXPECTED)
			expect((JSON.parse(readFileSync(path.join(folder, 'v.json'), 'utf8')) as CaseToReview[]).length).toBe(3)
		} finally {
			rmSync(folder, { recursive: true, force: true })
		}
	})
})
