import { ArticleShell, Lead, TeamSignature, TitleWithAccent } from './EditorialArticle'

export interface PageSection {
	titre: string
	texte: string
}

export interface PageContent {
	/** The title of the article, under the head of the page: the head holds the only h1. */
	titre: string
	introduction: string
	parties: readonly PageSection[]
}

/**
 * The text of a fixed page: a title, a few lines, then the parts one under the other, each a row (its title on the
 * left, its text on the right, a rule between). It sits under the `Hero` of the page, which carries the only h1; the
 * old pages had a second h1 here (« 1 h1 par page »). `eyebrow` is the label of the menu the page belongs to.
 */
export function PageArticle({ contenu, eyebrow }: { contenu: PageContent; eyebrow: string }) {
	return (
		<ArticleShell eyebrow={eyebrow} title={contenu.titre}>
			<Lead>{contenu.introduction}</Lead>
			<div className="mt-12 border-gray-200 border-t">
				{contenu.parties.map(partie => (
					<section
						key={partie.titre}
						className="reveal grid gap-3 border-gray-200 border-b py-9 sm:grid-cols-5 sm:gap-8"
					>
						<h3 className="font-display font-medium text-gray-900 text-xl leading-snug tracking-tight sm:col-span-2">
							<TitleWithAccent text={partie.titre} />
						</h3>
						<p className="max-w-[66ch] text-base text-gray-700 leading-7 sm:col-span-3">{partie.texte}</p>
					</section>
				))}
			</div>
			<TeamSignature />
		</ArticleShell>
	)
}
