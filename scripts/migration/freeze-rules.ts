/**
 * The rules of the freeze of the current site (ticket 172; plan 01 section 0 rule 4, decision of
 * 2026-10-14: the freeze is a step, not a date). Pure functions, no I/O: the command is
 * scripts/migration/gel.ts, the procedure is docs/migration/GEL.md.
 *
 * From the moment the rehearsal of the switch starts, the history of the old site may only gain
 * commits that are about security, the switch banner, the read-only mode, or contents.
 */

export const CATEGORIES_DU_GEL = ['securite', 'bandeau', 'lecture-seule', 'contenus'] as const
export type CategorieDuGel = (typeof CATEGORIES_DU_GEL)[number]

/** Scopes (`type(scope): subject`) and `Gel:` trailer values that put a commit in a category. */
const ALIAS: Record<string, CategorieDuGel> = {
	banner: 'bandeau',
	bandeau: 'bandeau',
	content: 'contenus',
	contenu: 'contenus',
	contenus: 'contenus',
	contents: 'contenus',
	'lecture-seule': 'lecture-seule',
	readonly: 'lecture-seule',
	'read-only': 'lecture-seule',
	securite: 'securite',
	security: 'securite',
	sécurité: 'securite',
}

export type CommitDeLAncienSite = {
	sha: string
	/** Committer date, ISO 8601. */
	date: string
	subject: string
	/** Full message body, trailers included. */
	body: string
	parents: number
}

export type Verdict = { sha: string; subject: string; categorie: CategorieDuGel | null; raison: string }

const ENTETE = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?!?:\s/u

/** The category of a commit, or null when it is not one of the four allowed during the freeze. */
export function categorieDuCommit(commit: Pick<CommitDeLAncienSite, 'subject' | 'body'>): CategorieDuGel | null {
	const trailer = /^Gel:\s*(?<valeur>\S+)\s*$/imu.exec(commit.body)?.groups?.valeur?.toLowerCase()
	if (trailer) return ALIAS[trailer] ?? null
	const entete = ENTETE.exec(commit.subject)?.groups
	if (!entete) return null
	for (const mot of [entete.scope, entete.type]) {
		const categorie = mot ? ALIAS[mot.toLowerCase()] : undefined
		if (categorie) return categorie
	}
	return null
}

export type RapportDuGel = {
	debut: string
	/** Commits dated at or after the start of the freeze, merges left out. */
	apresLeGel: Verdict[]
	/** The ones among them that no category covers. */
	interdits: Verdict[]
}

/** Checks a history against the start of the freeze. A merge commit carries no change of its own. */
export function verifierLHistorique(commits: CommitDeLAncienSite[], debut: string): RapportDuGel {
	const t0 = Date.parse(debut)
	if (Number.isNaN(t0)) throw new Error(`début du gel illisible : ${debut}`)
	const apresLeGel = commits
		.filter(commit => commit.parents < 2 && Date.parse(commit.date) >= t0)
		.map<Verdict>(commit => {
			const categorie = categorieDuCommit(commit)
			return {
				categorie,
				raison: categorie ? `permis : ${categorie}` : 'ni sécurité, ni bandeau, ni lecture seule, ni contenus',
				sha: commit.sha,
				subject: commit.subject,
			}
		})
	return { apresLeGel, debut, interdits: apresLeGel.filter(verdict => !verdict.categorie) }
}

/** Reference captures must be taken after the start of the freeze, or they describe a site that moved. */
export function verifierLesReferences(
	debut: string,
	references: { nom: string; prisLe: string | undefined }[]
): string[] {
	const t0 = Date.parse(debut)
	return references.flatMap(({ nom, prisLe }) => {
		if (!prisLe) return [`${nom} : date non donnée`]
		const t = Date.parse(prisLe)
		if (Number.isNaN(t)) return [`${nom} : date illisible (${prisLe})`]
		return t < t0 ? [`${nom} : prise le ${prisLe}, avant le gel (${debut}) ; à refaire`] : []
	})
}

/** Lines of `git log --format=%H%x1f%cI%x1f%P%x1f%s%x1f%b%x1e` into commits. */
export function lireLeJournalGit(sortie: string): CommitDeLAncienSite[] {
	return sortie
		.split('\x1e')
		.map(bloc => bloc.replace(/^\n/u, ''))
		.filter(bloc => bloc.trim() !== '')
		.map(bloc => {
			const [sha = '', date = '', parents = '', subject = '', body = ''] = bloc.split('\x1f')
			return { body, date, parents: parents.split(' ').filter(Boolean).length, sha, subject }
		})
}
