import { dayText } from '@/lib/emails/quote'
import type { MyQuote } from '@/lib/quote/dashboard'
import { QUOTE_STATUS_LABELS, SERVICE_TYPE_LABELS } from '@/lib/quote/request'

const RECEIVED = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })

const BUTTON =
	'inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-400 bg-white px-4 py-2 font-medium text-sm hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-700 focus-visible:outline-offset-2'

/**
 * « Demandes de devis » (issue 1003): the quote requests clients sent from her profile, the newest first, with
 * their status. Her own and nobody else's: the list is read by the profile of her session. `quotes` is `null`
 * when the reading failed. A request comes by email too; this card keeps them in one place.
 *
 * The contact of the client is shown here, to her alone: a page of the space is never shared nor listed by a search engine.
 */
export function QuoteRequests({
	quotes,
	mark,
}: {
	quotes: readonly MyQuote[] | null
	/** The Server Action that marks a request answered or new again (`quote-actions.ts`). */
	mark: (form: FormData) => Promise<void>
}) {
	return (
		<section
			aria-labelledby="mes-devis-titre"
			data-testid="mes-devis"
			className="w-full min-w-0 rounded-[22px] border border-[#E6DCD5] bg-white p-5 text-[#1A1417] sm:p-6"
		>
			<h2 id="mes-devis-titre" className="font-semibold text-lg">
				Demandes de devis
			</h2>
			{quotes === null ? (
				<p className="mt-2">Tes demandes de devis sont indisponibles pour le moment. Reviens dans un instant.</p>
			) : quotes.length === 0 ? (
				<p className="mt-2" data-testid="mes-devis-vide">
					Aucune demande pour le moment. Elles apparaîtront ici et t’arriveront aussi par email.
				</p>
			) : (
				<ul className="mt-3 flex flex-col gap-4">
					{quotes.map(quote => (
						<li key={quote.id} data-testid="mon-devis" className="rounded border border-neutral-200 p-3 sm:p-4">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="font-semibold">
									{quote.clientFirstName} · {SERVICE_TYPE_LABELS[quote.serviceType]}
								</p>
								<span
									data-testid="mon-devis-statut"
									className={`rounded-full px-3 py-1 font-medium text-sm ${quote.status === 'new' ? 'bg-indigo-100 text-indigo-900' : 'bg-green-100 text-green-900'}`}
								>
									{QUOTE_STATUS_LABELS[quote.status]}
								</span>
							</div>
							<dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
								<div>
									<dt className="text-neutral-600">Date de l’événement</dt>
									<dd>{dayText(quote.eventDate)}</dd>
								</div>
								<div>
									<dt className="text-neutral-600">Lieu</dt>
									<dd className="break-words">{quote.place}</dd>
								</div>
								<div>
									<dt className="text-neutral-600">Reçue le</dt>
									<dd>{RECEIVED.format(new Date(quote.receivedAt))}</dd>
								</div>
							</dl>
							<p className="mt-2 whitespace-pre-line break-words text-sm">{quote.message}</p>
							<div className="mt-3 flex flex-wrap gap-2">
								<a href={`mailto:${quote.clientEmail}`} className={BUTTON}>
									Répondre par email
								</a>
								{quote.clientPhone ? (
									<a href={`tel:${quote.clientPhone.replace(/[^\d+]/g, '')}`} className={BUTTON}>
										Appeler
									</a>
								) : null}
								<form action={mark}>
									<input type="hidden" name="id" value={quote.id} />
									<input type="hidden" name="status" value={quote.status === 'new' ? 'answered' : 'new'} />
									<button type="submit" className={BUTTON}>
										{quote.status === 'new' ? 'Marquer comme répondue' : 'Remettre en nouvelle'}
									</button>
								</form>
							</div>
						</li>
					))}
				</ul>
			)}
			<p className="mt-3 text-neutral-700 text-sm">
				Les demandes sont conservées 6 mois, puis supprimées. Les coordonnées de la cliente ne sont jamais publiques.
			</p>
		</section>
	)
}
