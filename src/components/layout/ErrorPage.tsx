import Link from 'next/link'
import { pillClassName } from '@/components/art/pill-class'

/**
 * The content of the error page (ticket 069): a sentence for the visitor, never the message or the
 * trace of the error. It asks the search engines to leave the page alone. In the kit's look (coherence
 * pass): paper, Bodoni, pills. The classes come from `pill-class`, which has no import: this page is a
 * client component's child and must not pull the drawings.
 */
export function ErrorPage({ reessayer }: { reessayer?: () => void }) {
	return (
		<main className="relative flex w-full flex-1 flex-col justify-center bg-art-paper text-ink">
			<meta name="robots" content="noindex, nofollow" />
			<div className="page-frame py-16">
				<div className="w-full max-w-md">
					<h1 className="text-balance font-display font-medium text-4xl leading-[1.1] tracking-tight sm:text-5xl">
						Un problème est survenu
					</h1>
					<p className="mt-6 text-lg text-mute leading-8">
						Le site ne peut pas afficher cette page pour le moment. Réessayez dans quelques instants.
					</p>
					<div className="mt-10 flex flex-col gap-4 sm:flex-row">
						{reessayer && (
							<button type="button" onClick={reessayer} className={pillClassName({ variant: 'filled' })}>
								Réessayer
							</button>
						)}
						<Link href="/" prefetch={false} className={pillClassName({ variant: 'outline' })}>
							Retourner à l'accueil
						</Link>
					</div>
				</div>
			</div>
		</main>
	)
}
