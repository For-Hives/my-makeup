import { MailList, MailParagraph, MakeupMail } from './components/MakeupMail'
import { MAIL_SITE } from './tokens'

/**
 * The empty version of the one-shot mail to the artists: the design with placeholder text. The real text
 * (and the personal details it holds) is NOT in the repository, which is public: it lives in the ignored
 * folder `src/emails/local/`, next to the script that sends it (docs/courriel-maquilleuses.md).
 */
export const ANNONCE_SUBJECT = 'Sujet du message'

export default function AnnonceMaquilleuses({ assetsBase }: { assetsBase?: string }) {
	return (
		<MakeupMail
			preview="Aperçu du message."
			eyebrow="Un message d’Andy"
			title={{ before: 'Titre du', emphasis: 'message', after: '.' }}
			action={{ label: 'Découvrir le nouveau site', href: MAIL_SITE }}
			signature={{ name: 'Andy', role: 'Fondateur de My Makeup' }}
			unsubscribeUrl={undefined}
			{...(assetsBase ? { assetsBase } : {})}
		>
			<MailParagraph>Premier paragraphe du message.</MailParagraph>
			<MailList items={['Premier point de la liste.', 'Deuxième point de la liste.']} />
			<MailParagraph>Dernier paragraphe du message.</MailParagraph>
		</MakeupMail>
	)
}
