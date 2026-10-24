/**
 * « Mise en avant » (issue 1066): the profiles the home page shows first. They are the profiles an admin
 * ticked « Vérifiée » (`profiles.verified`, src/lib/profile/verified.ts), drawn at random at every load of the page,
 * FEATURED_MAX at most, among those a visitor could open (publishable, listed, reachable: the same rules as the block
 * under a page of text). The « Activité vérifiée » badge (the SIRET) is another thing and takes no part in it.
 *
 * Relative imports on purpose: shared with the collections, loaded by the Payload CLI.
 */

/** The most cards the home page shows, whatever the number of verified profiles. */
export const FEATURED_MAX = 6

/**
 * The most candidates the cached HTML of the home page carries (four times FEATURED_MAX). The draw is made in the
 * browser among them; beyond this number the server keeps a random sample, renewed each time the page is refreshed
 * (a save of a profile, or the hour), so that the weight of the page stays flat however many profiles are verified.
 */
export const FEATURED_CANDIDATES_MAX = 24

/**
 * The two lines the first version of the box « Mise en avant » (issue 1066, field `featured`, now removed) left in
 * the journal of the admin's actions on a profile (`moderation-events`). Nothing writes them any more; they stay in
 * the enum and in the rows already written, so that the history keeps reading.
 */
export const LEGACY_FEATURE_ACTIONS = ['feature', 'unfeature'] as const
export type LegacyFeatureAction = (typeof LEGACY_FEATURE_ACTIONS)[number]

/** The class that carries the draw: the stylesheet shows its first FEATURED_MAX items, and the draw replaces that rule. */
export const FEATURED_LIST_CLASS = 'featured-list'

/**
 * The candidates the page carries, in the order they come (the order of the directory), `limit` at most. Beyond
 * `limit`, a random sample of that many, put back in the order of the directory.
 */
export function sampleCandidates<T>(candidates: readonly T[], limit: number, random: () => number = Math.random): T[] {
	if (candidates.length <= limit) return [...candidates]
	const indexes = candidates.map((_, index) => index)
	for (let last = indexes.length - 1; last > 0; last -= 1) {
		const other = Math.floor(random() * (last + 1))
		const kept = indexes[last] as number
		indexes[last] = indexes[other] as number
		indexes[other] = kept
	}
	return indexes
		.slice(0, limit)
		.sort((a, b) => a - b)
		.map(index => candidates[index] as T)
}

/**
 * The inline script that draws the cards in the browser (issue 1066). The HTML of the home page is cached and the
 * same for everyone, so the draw cannot be made by the server at each load: the page carries `count` candidates, the
 * stylesheet shows the first `show` of them (what a visitor without JavaScript sees), and this script, which runs
 * while the page is being read, adds a rule that shows `show` random ones instead. It changes no node of the page
 * (React hydrates them as they came) and loads nothing: a few hundred bytes of the HTML, none in the bundles.
 * Nothing moves, since the block holds `show` cards in both cases. Not needed when `count <= show`.
 */
export function featuredDrawScript(count: number, show: number = FEATURED_MAX): string {
	const items = `.${FEATURED_LIST_CLASS}>li`
	return (
		`(function(n,k){var a=[],i,j,t,c='${items}{display:none!important}';` +
		'for(i=1;i<=n;i++)a.push(i);' +
		'for(i=n;i>1;i--){j=Math.floor(Math.random()*i);t=a[i-1];a[i-1]=a[j];a[j]=t}' +
		`a.slice(0,k).forEach(function(i){c+='${items}:nth-child('+i+'){display:block!important}'});` +
		"var s=document.createElement('style');s.textContent=c;document.head.appendChild(s)" +
		`})(${Math.trunc(count)},${Math.trunc(show)})`
	)
}
