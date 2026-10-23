import { RANKING_LINK_TEXT, RANKING_PATH } from '@/lib/search/ranking'

/** The link under each list of makeup artists, to the page that explains how they are ranked (issue 1012). */
export function RankingLink({ className = 'mt-8' }: { className?: string }) {
	return (
		<p className={className}>
			<a href={RANKING_PATH} className="inline-flex min-h-[44px] items-center font-semibold text-indigo-900 underline">
				{RANKING_LINK_TEXT}
			</a>
		</p>
	)
}
