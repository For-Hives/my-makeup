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
 * The text of a fixed page: a title, a few lines, then the parts one under the other. It sits under the
 * `Hero` of the page, which carries the only h1; the old pages had a second h1 here (« 1 h1 par page »).
 */
export function PageArticle({ contenu }: { contenu: PageContent }) {
	return (
		<div className="relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0">
			<div className="mx-auto max-w-2xl">
				<article>
					<header className="flex flex-col">
						<h2 className="mt-6 font-bold text-3xl text-gray-800 tracking-tight sm:text-4xl">{contenu.titre}</h2>
					</header>
					<div className="prose xl:prose-lg my-8">
						<p>{contenu.introduction}</p>
						<ul>
							{contenu.parties.map(partie => (
								<li key={partie.titre}>
									<h3>{partie.titre}</h3>
									<p>{partie.texte}</p>
								</li>
							))}
						</ul>
					</div>
					<p className="flex items-center text-base text-gray-600">
						<span className="h-4 w-0.5 rounded-full bg-gray-200" />
						<span className="ml-3">L&apos;équipe My-Makeup</span>
					</p>
				</article>
			</div>
		</div>
	)
}
