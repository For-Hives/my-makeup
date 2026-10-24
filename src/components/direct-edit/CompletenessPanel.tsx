'use client'

import type { MouseEvent } from 'react'
import { PageOnline } from '@/components/dashboard/PageOnline'
import { ResumeRequests, type ResumeUpload } from '@/components/dashboard/ResumeRequests'
import {
	gaugePercent,
	HIDDEN_CONTACT_EMAIL,
	type Missing,
	type Progress,
	pageIsOnline,
	RANKED_LAST_TEXT,
} from '@/lib/dashboard/progress'
import { blockAnchor, CONTACT_BLOCK, CRITERION_BLOCK } from '@/lib/direct-edit/blocks'
import { useEditSession } from './EditSession'

/** What a draft says: her page is not online (decision of 23/10/2026), in plain words and without alarm. */
const DRAFT_TEXT = 'Ta page n’est pas encore en ligne : les clientes ne la voient pas.'

const LINK =
	'inline-flex min-h-11 items-center py-2 text-ink underline decoration-nude-300 underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2'

/** The sentence of a hidden page, its address as a link to write to. */
function WithMailLink({ text }: { text: string }) {
	const [before = '', after = ''] = text.split(HIDDEN_CONTACT_EMAIL)
	return (
		<>
			{before}
			<a className={LINK} href={`mailto:${HIDDEN_CONTACT_EMAIL}`}>
				{HIDDEN_CONTACT_EMAIL}
			</a>
			{after}
		</>
	)
}

/**
 * Where her profile stands, above her page (issue 1022): « Ton profil est rempli à N % », a sober bar, what the
 * state changes (draft, online, paused, hidden with its reason), and the points she lacks. Each point is a link
 * that opens the block of her page that completes it, and asks first when another block holds changes
 * not saved. Nothing is computed here: the reading is `profileProgress`, by the single rule of a profile.
 *
 * The bar and the text are ink: the lipstick red is reserved for what she can change, on the blocks.
 */
export function CompletenessPanel({
	progress,
	resume,
	address,
	greeting,
}: {
	progress: Progress
	/** The save that sets her available again, for the button « Reprendre les demandes ». */
	resume?: ResumeUpload
	/** Her public address in full, once her page is online. */
	address?: string | null
	/** « Bonjour Audrey, tu es connectée. » */
	greeting?: string
}) {
	const session = useEditSession()
	const hidden = progress.etat === 'masque'
	const draft = progress.etat === 'vide' || progress.etat === 'incomplet'
	const percent = gaugePercent(progress)
	const required = progress.manques.filter(point => point.requis)
	const others = progress.manques.filter(point => !point.requis)

	const open = (block: string) => (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		event.preventDefault()
		session.open(block)
	}

	const points = (list: readonly Missing[], id: string, title: string) =>
		list.length === 0 ? null : (
			<div>
				<h3 id={id} className="font-display font-medium text-base text-ink">
					{title}
				</h3>
				<ul aria-labelledby={id} className="mt-1 flex flex-col">
					{list.map(point => {
						const block = CRITERION_BLOCK[point.critere]
						return (
							<li key={point.critere}>
								<a href={`#${blockAnchor(block)}`} data-missing={point.critere} onClick={open(block)} className={LINK}>
									{point.texte}
								</a>
							</li>
						)
					})}
				</ul>
			</div>
		)

	return (
		<section
			aria-labelledby="completeness-title"
			data-testid="completeness"
			data-etat={progress.etat}
			className="border-hairline border-b bg-blush font-body text-ink"
		>
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 md:px-8">
				{greeting === undefined ? null : (
					<p data-testid="greeting" className="text-mute text-sm">
						{greeting}
					</p>
				)}
				<h2 id="completeness-title" className="font-display font-medium text-2xl sm:text-3xl">
					{hidden ? progress.titre : `Ton profil est rempli à ${percent} %`}
				</h2>
				<div
					role="progressbar"
					aria-labelledby="completeness-title"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={percent}
					aria-valuetext={`${percent} %`}
					data-grise={hidden ? 'true' : undefined}
					className="h-2 w-full max-w-xl overflow-hidden rounded-full bg-nude-200"
				>
					<div className={`h-full ${hidden ? 'bg-nude-300' : 'bg-ink'}`} style={{ width: `${percent}%` }} />
				</div>
				<div data-testid="completeness-state" className="flex max-w-2xl flex-col gap-2 text-sm sm:text-base">
					{draft ? (
						<p data-testid="brouillon">
							<span
								data-testid="brouillon-pastille"
								className="mr-2 inline-block rounded-full border border-hairline bg-white px-3 py-0.5 align-middle font-semibold text-ink text-sm leading-6"
							>
								En brouillon
							</span>
							{DRAFT_TEXT}
						</p>
					) : null}
					{/* A draft says its own words; the pause and the hidden page are said as well, whatever the state. */}
					{(draft && !progress.enPause) || progress.consequence === '' ? null : (
						<p data-testid="completeness-consequence">
							{hidden ? <WithMailLink text={progress.consequence} /> : progress.consequence}
						</p>
					)}
					{resume && !hidden ? <ResumeRequests enPause={progress.enPause} envoyer={resume} /> : null}
					{progress.rankedLast ? (
						<p data-testid="completeness-sans-contact">
							{RANKED_LAST_TEXT}{' '}
							<a href={`#${blockAnchor(CONTACT_BLOCK)}`} onClick={open(CONTACT_BLOCK)} className={LINK}>
								Ajouter mes coordonnées
							</a>
						</p>
					) : null}
				</div>
				{pageIsOnline(progress) && address ? <PageOnline adresse={address} /> : null}
				{hidden ? null : (
					<div className="flex max-w-2xl flex-col gap-3">
						{points(required, 'completeness-required', 'Pour être publiable')}
						{others.length > 0 ? (
							<details data-testid="completeness-others">
								<summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink underline decoration-nude-300 underline-offset-4">
									Pour un profil plus complet ({others.length})
								</summary>
								{points(others, 'completeness-others-list', 'Pour un profil plus complet')}
							</details>
						) : null}
					</div>
				)}
			</div>
		</section>
	)
}
