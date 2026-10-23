import { BADGE_ANCHOR, BADGE_EXPLANATION, BADGE_TITLE } from '@/lib/activity/badge-text'
import { RANKING_EXCLUDED, RANKING_GROUPS, RANKING_RULES } from '@/lib/search/ranking'

/**
 * What the page `/classement` says: the rules of src/lib/search/ranking.ts, in their order, then what does not
 * count. It writes nothing of its own: a sentence here that the code does not follow would be a promise
 * nobody keeps, and a test plays every rule (tests/unit/ranking-transparency.test.tsx).
 */
export function RankingExplainer() {
	return (
		<article className="mx-auto w-full max-w-3xl px-4 py-12 text-gray-800 md:py-16">
			<h1 className="font-bold text-3xl text-gray-900 tracking-tight">Comment sont classées les maquilleuses</h1>
			<p className="mt-4 text-gray-700 text-lg leading-8">
				My Makeup classe les maquilleuses de façon neutre : personne ne peut payer pour passer devant. Voici, dans
				l’ordre, ce que fait la recherche, et ce qu’elle ne fait pas.
			</p>
			{RANKING_GROUPS.map(group => (
				<section key={group.id} aria-labelledby={`classement-${group.id}`} className="mt-10">
					<h2 id={`classement-${group.id}`} className="font-bold text-gray-900 text-xl">
						{group.title}
					</h2>
					<ol className="mt-4 flex list-decimal flex-col gap-3 pl-6 text-gray-700 leading-7">
						{RANKING_RULES.filter(rule => rule.group === group.id).map(rule => (
							<li key={rule.id}>{rule.text}</li>
						))}
					</ol>
				</section>
			))}
			<section aria-labelledby="classement-exclus" className="mt-10">
				<h2 id="classement-exclus" className="font-bold text-gray-900 text-xl">
					Ce qui ne compte pas
				</h2>
				<ul className="mt-4 flex list-disc flex-col gap-3 pl-6 text-gray-700 leading-7">
					{RANKING_EXCLUDED.map(line => (
						<li key={line}>{line}</li>
					))}
				</ul>
			</section>
			<section id={BADGE_ANCHOR} aria-labelledby="classement-badge" className="mt-10 scroll-mt-6">
				<h2 id="classement-badge" className="font-bold text-gray-900 text-xl">
					{BADGE_TITLE}
				</h2>
				<div className="mt-4 flex flex-col gap-3 text-gray-700 leading-7">
					{BADGE_EXPLANATION.map(paragraph => (
						<p key={paragraph}>{paragraph}</p>
					))}
				</div>
			</section>
			<p className="mt-10 text-gray-700">
				Une erreur dans cette page, ou un résultat qui ne la suit pas ?{' '}
				<a href="/contact" className="font-semibold text-indigo-900 underline">
					Écrivez-nous
				</a>
				.
			</p>
		</article>
	)
}
