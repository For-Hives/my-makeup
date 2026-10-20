/**
 * The rules of the freeze of the current site (ticket 172; plan 01 section 0 rule 4, decision of
 * 2026-10-14: the freeze is a step, not a date). Pure functions, no I/O: the command is
 * scripts/migration/freeze.ts, the procedure is docs/migration/GEL.md.
 *
 * From the moment the rehearsal of the switch starts, the history of the old site may only gain
 * commits that are about security, the switch banner, the read-only mode, or contents.
 */

export const FREEZE_CATEGORIES = ['securite', 'bandeau', 'lecture-seule', 'contenus'] as const
export type FreezeCategory = (typeof FREEZE_CATEGORIES)[number]

/** Scopes (`type(scope): subject`) and `Gel:` trailer values that put a commit in a category. */
const ALIAS: Record<string, FreezeCategory> = {
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

export type OldSiteCommit = {
	sha: string
	/** Committer date, ISO 8601. */
	date: string
	subject: string
	/** Full message body, trailers included. */
	body: string
	parents: number
}

export type Verdict = { sha: string; subject: string; category: FreezeCategory | null; reason: string }

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?!?:\s/u

/** The category of a commit, or null when it is not one of the four allowed during the freeze. */
export function commitCategory(commit: Pick<OldSiteCommit, 'subject' | 'body'>): FreezeCategory | null {
	const trailer = /^Gel:\s*(?<valeur>\S+)\s*$/imu.exec(commit.body)?.groups?.valeur?.toLowerCase()
	if (trailer) return ALIAS[trailer] ?? null
	const header = HEADER.exec(commit.subject)?.groups
	if (!header) return null
	for (const password of [header.scope, header.type]) {
		const category = password ? ALIAS[password.toLowerCase()] : undefined
		if (category) return category
	}
	return null
}

export type FreezeReport = {
	start: string
	/** Commits dated at or after the start of the freeze, merges left out. */
	afterFreeze: Verdict[]
	/** The ones among them that no category covers. */
	forbidden: Verdict[]
}

/** Checks a history against the start of the freeze. A merge commit carries no change of its own. */
export function verifyHistory(commits: OldSiteCommit[], debut: string): FreezeReport {
	const t0 = Date.parse(debut)
	if (Number.isNaN(t0)) throw new Error(`début du gel illisible : ${debut}`)
	const afterFreeze = commits
		.filter(commit => commit.parents < 2 && Date.parse(commit.date) >= t0)
		.map<Verdict>(commit => {
			const category = commitCategory(commit)
			return {
				category: category,
				reason: category ? `permis : ${category}` : 'ni sécurité, ni bandeau, ni lecture seule, ni contenus',
				sha: commit.sha,
				subject: commit.subject,
			}
		})
	return { afterFreeze, start: debut, forbidden: afterFreeze.filter(verdict => !verdict.category) }
}

/** Reference captures must be taken after the start of the freeze, or they describe a site that moved. */
export function verifyReferences(debut: string, references: { name: string; takenAt: string | undefined }[]): string[] {
	const t0 = Date.parse(debut)
	return references.flatMap(({ name: nom, takenAt: prisLe }) => {
		if (!prisLe) return [`${nom} : date non donnée`]
		const t = Date.parse(prisLe)
		if (Number.isNaN(t)) return [`${nom} : date illisible (${prisLe})`]
		return t < t0 ? [`${nom} : prise le ${prisLe}, avant le gel (${debut}) ; à refaire`] : []
	})
}

/** Lines of `git log --format=%H%x1f%cI%x1f%P%x1f%s%x1f%b%x1e` into commits. */
export function readGitLog(sortie: string): OldSiteCommit[] {
	return sortie
		.split('\x1e')
		.map(bloc => bloc.replace(/^\n/u, ''))
		.filter(bloc => bloc.trim() !== '')
		.map(bloc => {
			const [sha = '', date = '', parents = '', subject = '', body = ''] = bloc.split('\x1f')
			return { body, date, parents: parents.split(' ').filter(Boolean).length, sha, subject }
		})
}
