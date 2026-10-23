import type { DraftNotice as Notice } from '@/lib/dashboard/draft-notice'

const BUTTON =
	'inline-flex min-h-11 items-center justify-center rounded-full border border-lipstick bg-lipstick px-6 font-semibold text-sm text-white focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2'

/**
 * « En brouillon » (decision of 23/10/2026): her page is not online, and she reads it plainly, without
 * alarm and without the colour of an error (the lipstick red is reserved for what she can change, so
 * only the button wears it). The list is the missing points of the single rule of a profile; the
 * button leads to the first block to complete in the direct edition. Kept short: on a phone, her space
 * must still show its cards in the first screens.
 */
export function DraftNotice({ notice }: { notice: Notice }) {
	return (
		<section
			aria-labelledby="brouillon-titre"
			data-testid="brouillon"
			className="flex w-full min-w-0 flex-col gap-2 rounded-card border border-hairline bg-white p-4 sm:p-6"
		>
			<h2 id="brouillon-titre" className="font-semibold text-base text-ink leading-7 sm:text-lg">
				<span
					data-testid="brouillon-pastille"
					className="mr-2 inline-block rounded-full border border-hairline bg-blush px-3 py-0.5 align-middle font-semibold text-ink text-sm leading-6"
				>
					En brouillon
				</span>
				Ta page n’est pas encore en ligne : les clientes ne la voient pas.
			</h2>
			<p className="text-ink text-sm sm:text-base" data-testid="brouillon-manques">
				<span className="text-mute">Il te manque : </span>
				{notice.lines.join(', ')}.
			</p>
			<a href={notice.href} className={`${BUTTON} mt-1 w-full sm:w-fit`} data-testid="brouillon-completer">
				Compléter ma page
			</a>
		</section>
	)
}
