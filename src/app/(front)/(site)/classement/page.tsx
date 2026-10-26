import type { Metadata } from 'next'
import { RankingExplainer } from '@/components/ranking/RankingExplainer'
import { ArtPage } from '@/components/static-pages/ArtPage'
import { RANKING_PATH } from '@/lib/search/ranking'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = pageMetadata({
	titre: 'Comment sont classées les maquilleuses sur My Makeup',
	description:
		'Comment My Makeup classe les maquilleuses dans la recherche : la ville, la distance, les mots tapés. Aucun classement payant.',
	repli: 'Comment My Makeup classe les maquilleuses dans la recherche : aucun classement payant.',
	chemin: RANKING_PATH,
})

export default function RankingPage() {
	return (
		<ArtPage>
			{/* The frame of the pages: on a phone the white card keeps the gutter of the others instead of touching the edges. */}
			<div className="page-frame">
				<RankingExplainer />
			</div>
		</ArtPage>
	)
}
