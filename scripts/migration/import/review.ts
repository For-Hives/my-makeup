/**
 * The private list of review of the zones, written for a person (ticket 262; plans/PLAN-ZONES.md §3.5).
 *
 * `--review v.json` writes the list as JSON, as before, and a file `v.md` next to it, one section
 * per profile: its reason in French, what the import asked the referential, the communes it could
 * be, and the lines of the table of decisions ready to copy.
 *
 * Like the JSON, it never holds the text typed: only what was asked of the referential (a name of
 * commune, a postal code, a département) and the communes of the referential. No email, no name of
 * a person. The profiles are named by their number in the old base.
 */

import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { CaseToReview, ReasonToReview } from './cities'

/** The reason of each case, in French, as the title of its section says it. */
const REASON_TITLES: Readonly<Record<ReasonToReview, string>> = {
	'code-postal-partage': 'code postal partagé',
	homonymes: 'plusieurs communes portent ce nom',
	introuvable: 'commune introuvable',
	'pas-une-commune': 'ce n’est pas une commune',
}

/** The file written next to the JSON list: `v.json` gives `v.md`, any other name gets `.md` in place of its extension. */
export function readableReviewPath(jsonPath: string): string {
	const { dir, name } = path.parse(jsonPath)
	return path.join(dir, `${name}.md`)
}

/** What the import asked the referential, in a sentence; nothing is said of the text itself. */
function askedSentence(search: CaseToReview['recherche']): string {
	const asks = [
		search.nom === null ? null : `le nom de commune « ${search.nom} »`,
		search.codePostal === null ? null : `le code postal ${search.codePostal}`,
		search.departement === null ? null : `le département ${search.departement}`,
	].filter((ask): ask is string => ask !== null)
	return asks.length === 0
		? 'Cherché : rien, le texte ne donne ni nom de commune ni code postal.'
		: `Cherché : ${asks.join(', ')}.`
}

/** A commune as the list shows it: « Cuinchy (62), code INSEE 62262 ». */
const cityLine = ({ nom: name, code, departement: department }: CaseToReview['candidats'][number]): string =>
	`${name}${department === null ? '' : ` (${department})`}, code INSEE ${code}`

/** A line of the table of decisions, as it is copied: one commune, none, or countries. */
const cityDecision = (profile: number, inseeCode: string | null): string =>
	`{ "profile": ${profile}, "inseeCode": ${inseeCode === null ? 'null' : `"${inseeCode}"`} }`

function section({
	profil: profile,
	motif,
	adresse: address,
	recherche: search,
	candidats: candidates,
}: CaseToReview): string {
	const lines = [`## Profil ${profile} : ${REASON_TITLES[motif]}`, '']
	if (address) lines.push('Le texte était une adresse postale : sa rue n’a jamais été lue ni gardée.', '')
	lines.push(askedSentence(search))
	if (candidates.length === 0) lines.push('Communes possibles : aucune.')
	else lines.push('Communes possibles :', ...candidates.map(candidate => `- ${cityLine(candidate)}`))
	lines.push(
		'',
		'Pour trancher, ajoute à la table de décision, dans « cities », une seule de ces lignes :',
		'',
		'```json'
	)
	lines.push(...candidates.map(({ code }) => cityDecision(profile, code)))
	lines.push(cityDecision(profile, null))
	if (motif === 'introuvable' || motif === 'pas-une-commune')
		lines.push(`{ "profile": ${profile}, "countries": ["XX"], "town": null }`)
	lines.push('```', '')
	lines.push(`- \`"inseeCode": null\` laisse la zone vide, et le profil n’est plus à revoir.`)
	if (motif === 'introuvable' || motif === 'pas-une-commune')
		lines.push(
			'- `"countries"` dit un à cinq pays par leur code ISO (BE, IT, CH…), dont un étranger ; `"town"` est le nom de la ville, seulement avec un seul pays étranger, sinon `null`. Remplace `XX` (qui est refusé tel quel) par les pays de la maquilleuse.'
		)
	return lines.join('\n')
}

/** The list of review as a document a person reads: one section per profile, by number. */
export function reviewAsMarkdown(revue: readonly CaseToReview[]): string {
	const intro = [
		'# Zones à revoir',
		'',
		'Liste privée, à lire par son seul propriétaire. Elle ne contient aucun texte saisi par une maquilleuse : seulement ce qui a été demandé au référentiel des communes (geo.api.gouv.fr) et les communes qu’il a données. Les profils sont désignés par leur numéro dans l’ancienne base.',
		'',
		revue.length === 0
			? 'Aucun profil à revoir.'
			: `${revue.length} ${revue.length === 1 ? 'profil à revoir' : 'profils à revoir'}. Chaque ligne proposée se copie telle quelle dans la table de décision (\`--decisions\`), sous « cities » ; la table garde une seule ligne par profil.`,
	]
	const sorted = [...revue].sort((a, b) => a.profil - b.profil)
	return `${[intro.join('\n'), ...sorted.map(section)].join('\n\n').trimEnd()}\n`
}

/**
 * Writes the list of review as JSON at `jsonPath` and as a document next to it, both readable by
 * their owner only: the mode of a file that already existed is tightened before the write, because it
 * keeps the mode it had.
 */
export function writeReviewFiles(jsonPath: string, revue: readonly CaseToReview[]): void {
	const files: [string, string][] = [
		[jsonPath, `${JSON.stringify(revue, null, '\t')}\n`],
		[readableReviewPath(jsonPath), reviewAsMarkdown(revue)],
	]
	for (const [file, text] of files) {
		// Tighten a file that already exists before the text goes in, then write.
		if (existsSync(file)) chmodSync(file, 0o600)
		writeFileSync(file, text, { mode: 0o600 })
	}
}
