import Link from 'next/link'

/**
 * The content of the error page (ticket 069): a sentence for the visitor, never the message or the
 * trace of the error. It asks the search engines to leave the page alone.
 */
export function ErrorPage({ reessayer }: { reessayer?: () => void }) {
	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-16 sm:px-6 lg:px-20">
			<meta name="robots" content="noindex, nofollow" />
			<div className="w-full max-w-sm">
				<h1 className="my-8 font-semibold text-2xl text-slate-900">Un problème est survenu</h1>
				<p className="text-gray-700">
					Le site ne peut pas afficher cette page pour le moment. Réessayez dans quelques instants.
				</p>
				<div className="mt-8 flex flex-col gap-4">
					{reessayer && (
						<button type="button" onClick={reessayer} className="btn-primary-large">
							Réessayer
						</button>
					)}
					<Link href="/" prefetch={false} className="btn-primary-large">
						Retourner à l'accueil
					</Link>
				</div>
			</div>
		</main>
	)
}
