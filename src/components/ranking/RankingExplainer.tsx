import { PageHead } from '@/components/static-pages/PageHead'
import { BADGE_ANCHOR, BADGE_EXPLANATION, BADGE_TITLE } from '@/lib/activity/badge-text'
import { BADGES_ANCHOR, BADGES_EXPLANATION, BADGES_TITLE } from '@/lib/profile/badges'
import { RANKING_EXCLUDED, RANKING_GROUPS, RANKING_RULES } from '@/lib/search/ranking'

/**
 * What the page `/classement` says: the rules of src/lib/search/ranking.ts, in their order, then what does not
 * count. It writes nothing of its own: a sentence here that the code does not follow would be a promise
 * nobody keeps, and a test plays every rule (tests/unit/ranking-transparency.test.tsx).
 */
export function RankingExplainer() {
	return (
		<>
			<PageHead
				layout="centered"
				glow="indigo"
				title="Comment sont classées les maquilleuses"
				description="My Makeup classe les maquilleuses de façon neutre : personne ne peut payer pour passer devant. Voici, dans l’ordre, ce que fait la recherche, et ce qu’elle ne fait pas."
			/>
			<article className="relative mx-auto mb-24 w-full max-w-3xl rounded-art-frame bg-white px-6 py-10 text-ink sm:px-12 sm:py-14">
				{RANKING_GROUPS.map(group => (
					<section key={group.id} aria-labelledby={`classement-${group.id}`} className="reveal mt-10">
						<h2 id={`classement-${group.id}`} className="font-display font-medium text-2xl text-ink">
							{group.title}
						</h2>
						<ol className="mt-4 flex list-decimal flex-col gap-3 pl-6 text-mute leading-7">
							{RANKING_RULES.filter(rule => rule.group === group.id).map(rule => (
								<li key={rule.id}>{rule.text}</li>
							))}
						</ol>
					</section>
				))}
				<section aria-labelledby="classement-exclus" className="reveal mt-10">
					<h2 id="classement-exclus" className="font-display font-medium text-2xl text-ink">
						Ce qui ne compte pas
					</h2>
					<ul className="mt-4 flex list-disc flex-col gap-3 pl-6 text-mute leading-7">
						{RANKING_EXCLUDED.map(line => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</section>
				<section id={BADGES_ANCHOR} aria-labelledby="classement-badges" className="reveal mt-10 scroll-mt-6">
					<h2 id="classement-badges" className="font-display font-medium text-2xl text-ink">
						{BADGES_TITLE}
					</h2>
					<div className="mt-4 flex flex-col gap-3 text-mute leading-7">
						{BADGES_EXPLANATION.map(paragraph => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</div>
				</section>
				<section id={BADGE_ANCHOR} aria-labelledby="classement-badge" className="reveal mt-10 scroll-mt-6">
					<h2 id="classement-badge" className="font-display font-medium text-2xl text-ink">
						{BADGE_TITLE}
					</h2>
					<div className="mt-4 flex flex-col gap-3 text-mute leading-7">
						{BADGE_EXPLANATION.map(paragraph => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</div>
				</section>
				<p className="mt-10 text-mute">
					Une erreur dans cette page, ou un résultat qui ne la suit pas ?{' '}
					<a
						href="/contact"
						data-cta="classement_contact"
						className="font-semibold text-indigo-800 underline underline-offset-4 hover:text-indigo-950"
					>
						Écrivez-nous
					</a>
					.
				</p>
			</article>
		</>
	)
}
