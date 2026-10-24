import { ResumeRequests, type ResumeUpload } from '@/components/dashboard/ResumeRequests'
import { CONTACT_BLOCK, CRITERION_BLOCK, editBlockHref } from '@/lib/dashboard/edit-blocks'
import {
	gaugePercent,
	HIDDEN_CONTACT_EMAIL,
	type Missing,
	overviewStatus,
	type Progress,
	RANKED_LAST_TEXT,
} from '@/lib/dashboard/progress'
import { CARD, EDIT_LINK, SECONDARY, TITLE } from './card'

const BADGE: Record<ReturnType<typeof overviewStatus>['code'], string> = {
	visible: 'border-[#2F6B4F] bg-[#EAF4EE] text-[#1F4D37]',
	draft: 'border-[#C9B8AD] bg-[#F7F2EF] text-[#1A1417]',
	hidden: 'border-[#8A1F3A] bg-[#F6E1E6] text-[#5E1327]',
	internal: 'border-[#C9B8AD] bg-[#F7F2EF] text-[#1A1417]',
}

const BADGE_TEXT = { visible: 'Visible', draft: 'En brouillon', hidden: 'Masquée', internal: 'Interne' } as const

/** The sentence of a hidden page, its address as a link to write to. */
function WithMailLink({ text }: { text: string }) {
	const [before = '', after = ''] = text.split(HIDDEN_CONTACT_EMAIL)
	return (
		<>
			{before}
			<a className={EDIT_LINK} href={`mailto:${HIDDEN_CONTACT_EMAIL}`}>
				{HIDDEN_CONTACT_EMAIL}
			</a>
			{after}
		</>
	)
}

function Points({ points, id, title }: { points: readonly Missing[]; id: string; title: string }) {
	if (points.length === 0) return null
	return (
		<div>
			<h3 id={id} className="font-semibold text-base">
				{title}
			</h3>
			<ul aria-labelledby={id} className="mt-1 flex flex-col">
				{points.map(point => (
					<li key={point.critere} data-critere={point.critere}>
						<a className={EDIT_LINK} href={editBlockHref(CRITERION_BLOCK[point.critere])}>
							{point.texte}
						</a>
					</li>
				))}
			</ul>
		</div>
	)
}

/**
 * Where her profile stands (issue 1073): visible to everyone, a draft, hidden by the team (with its reason), how far it is
 * filled (« Ton profil est rempli à N % », a sober bar), and what misses, each point a link to the block of the edit mode
 * that completes it. Nothing is computed here: the reading is `profileProgress`, by the single rule of a profile, and the
 * block of each point is `CRITERION_BLOCK`. A server component: the page renders again after each save.
 */
export function OverviewStatus({ progress, resume }: { progress: Progress; resume?: ResumeUpload }) {
	const state = overviewStatus(progress)
	const hidden = state.code === 'hidden'
	const percent = gaugePercent(progress)
	const required = progress.manques.filter(point => point.requis)
	const others = progress.manques.filter(point => !point.requis)
	return (
		<section
			aria-labelledby="avancement-titre"
			data-testid="avancement"
			data-etat={progress.etat}
			data-statut={state.code}
			className={CARD}
		>
			<div className="flex flex-wrap items-center gap-3">
				<span
					data-testid={state.code === 'draft' ? 'brouillon-pastille' : 'statut-pastille'}
					className={`rounded-full border px-3 py-0.5 font-semibold text-sm ${BADGE[state.code]}`}
				>
					{BADGE_TEXT[state.code]}
				</span>
				<h2 id="avancement-titre" className={TITLE}>
					{state.title}
				</h2>
			</div>
			<p data-testid="avancement-consequence" className={`mt-2 ${SECONDARY}`}>
				{hidden ? <WithMailLink text={state.text} /> : state.text}
			</p>
			{state.paused && progress.consequence !== state.text ? (
				<p data-testid="avancement-pause" className={`mt-1 ${SECONDARY}`}>
					{progress.consequence}
				</p>
			) : null}
			{resume && !hidden ? <ResumeRequests enPause={progress.enPause} envoyer={resume} /> : null}
			<div className="mt-4">
				<p data-testid="avancement-score" className="font-semibold">
					{hidden ? 'Ta page n’est pas visible.' : `Ton profil est rempli à ${percent} %`}
				</p>
				<div
					role="progressbar"
					aria-label="Avancement de ton profil"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={percent}
					aria-valuetext={`${percent} %`}
					data-grise={hidden ? 'true' : undefined}
					className="mt-2 h-2 w-full max-w-xl overflow-hidden rounded-full bg-[#EBDDD4]"
				>
					<div className={`h-full ${hidden ? 'bg-[#CDB8AC]' : 'bg-[#1A1417]'}`} style={{ width: `${percent}%` }} />
				</div>
			</div>
			{progress.rankedLast ? (
				<p data-testid="avancement-sans-contact" className="mt-3">
					{RANKED_LAST_TEXT}{' '}
					<a className={EDIT_LINK} href={editBlockHref(CONTACT_BLOCK)}>
						Ajouter mes coordonnées
					</a>
				</p>
			) : null}
			{hidden ? null : (
				<div className="mt-4 flex max-w-2xl flex-col gap-3">
					<Points id="avancement-requis" title="Pour être publiable" points={required} />
					{others.length > 0 ? (
						<details data-testid="avancement-autres-details">
							<summary className="flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-4">
								Pour un profil plus complet ({others.length})
							</summary>
							<Points id="avancement-autres" title="Pour un profil plus complet" points={others} />
						</details>
					) : null}
				</div>
			)}
		</section>
	)
}
