import { MailParagraph, MakeupMail } from './components/MakeupMail'
import { MAIL_SITE } from './tokens'

/**
 * The mail to all the artists: the project is taken back in hand, what was redone. The design is final;
 * the TEXT BELOW IS A DRAFT, to be replaced by the text of the maintainer (issue 998 and docs/courriel-maquilleuses.md).
 */
export const ANNONCE_SUBJECT = 'My Makeup repart, et ça change pour toi'

export default function AnnonceMaquilleuses({
	unsubscribeUrl = `${MAIL_SITE}/api/reminders/unsubscribe?token=exemple`,
	assetsBase,
}: {
	unsubscribeUrl?: string
	assetsBase?: string
}) {
	return (
		<MakeupMail
			preview="Une grande mise à jour, et un site qui repart pour de bon."
			eyebrow="Des nouvelles de My Makeup"
			title={{ before: 'My Makeup repart,', emphasis: 'avec toi', after: 'cette fois.' }}
			action={{ label: 'Ouvrir mon espace', href: `${MAIL_SITE}/auth/profil` }}
			signature={{ name: 'Andy', role: 'Fondateur de My Makeup' }}
			unsubscribeUrl={unsubscribeUrl}
			{...(assetsBase ? { assetsBase } : {})}
		>
			<MailParagraph>
				Texte provisoire. Bonjour, j’ai repris le projet en main. My Makeup est l’un de mes tout premiers projets, né au
				début de mes études.
			</MailParagraph>
			<MailParagraph>
				Aujourd’hui, j’ai plus de temps et beaucoup plus de compétences. Le site a reçu une grande mise à jour, de
				l’apparence au fonctionnement, et les bugs qui traînaient depuis des années ont disparu.
			</MailParagraph>
			<MailParagraph>
				Le projet va avancer plus vite. Dis-moi ce qu’il te faut : j’aimerais répondre à tous tes besoins.
			</MailParagraph>
		</MakeupMail>
	)
}
