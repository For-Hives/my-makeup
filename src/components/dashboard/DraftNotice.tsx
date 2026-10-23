import type { DraftNotice as Notice } from '@/lib/dashboard/draft-notice'

const BUTTON =
	'inline-flex min-h-11 items-center justify-center rounded-full border border-lipstick bg-lipstick px-6 font-semibold text-sm text-white focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2'

/**
 * « En brouillon » (decision of 23/10/2026): her page is not online, and she reads it plainly, without
 * alarm and without the colour of an error (the lipstick red is reserved for what she can change, so
 * only the button wears it). The lines are the missing points of the single rule of a profile; the
 * button leads to the first block to complete in the direct edition.
 */
export function DraftNotice({ notice }: { notice: Notice }) {
	return (
		<section
			aria-labelledby="brouillon-titre"
			data-testid="brouillon"
			className="flex w-full min-w-0 flex-col gap-3 rounded-card border border-hairline bg-white p-5 sm:p-6"
		>
			<p
				data-testid="brouillon-pastille"
				className="w-fit rounded-full border border-hairline bg-blush px-3 py-1 font-semibold text-ink text-sm"
			>
				En brouillon
			</p>
			<h2 id="brouillon-titre" className="font-semibold text-ink text-lg">
				Ta page n’est pas encore en ligne : les clientes ne la voient pas.
			</h2>
			<p className="text-mute">Il te manque :</p>
			<ul className="flex list-disc flex-col gap-1 pl-5 text-ink" data-testid="brouillon-manques">
				{notice.lines.map(line => (
					<li key={line}>{line}</li>
				))}
			</ul>
			<a href={notice.href} className={`${BUTTON} w-full sm:w-fit`} data-testid="brouillon-completer">
				Compléter ma page
			</a>
		</section>
	)
}
