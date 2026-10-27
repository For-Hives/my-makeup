import { Link } from '@react-email/components'
import { MailList, MailParagraph, MakeupMail } from './components/MakeupMail'
import { MAIL_COLORS, MAIL_SITE } from './tokens'

/**
 * The mail to all the artists: the maintainer takes the project back in hand and asks for their feedback.
 * The text is his, only the spelling is corrected. His personal phone number and address are not in the
 * repository (it is public): they come from the environment of the machine that renders or sends the mail
 * (`ANNONCE_PHONE`, `ANNONCE_EMAIL`), and a line is left out when its variable is missing.
 */
export const ANNONCE_SUBJECT = 'J’ai besoin de vous, un message d’Andy'

const link = { color: MAIL_COLORS.blushInk, textDecoration: 'underline' } as const

export default function AnnonceMaquilleuses({
	unsubscribeUrl = `${MAIL_SITE}/api/reminders/unsubscribe?token=exemple`,
	assetsBase,
	phone = process.env.ANNONCE_PHONE,
	personalEmail = process.env.ANNONCE_EMAIL,
}: {
	unsubscribeUrl?: string
	assetsBase?: string
	phone?: string | undefined
	personalEmail?: string | undefined
}) {
	return (
		<MakeupMail
			preview="Ce message est important, et je l’ai écrit avec le cœur (et sans aucune IA)."
			eyebrow="Un message d’Andy"
			title={{ before: 'J’ai besoin de', emphasis: 'vous', after: '.' }}
			action={{ label: 'Découvrir le nouveau site', href: MAIL_SITE }}
			signature={{ name: 'Andy', role: 'Fondateur de My Makeup' }}
			unsubscribeUrl={unsubscribeUrl}
			{...(assetsBase ? { assetsBase } : {})}
		>
			<MailParagraph>Bonjour à toutes &amp; à tous !</MailParagraph>
			<MailParagraph>
				Je te contacte aujourd’hui, comme toutes les utilisatrices de My-Makeup : j’ai besoin de vous. Ce message est
				important, je t’en supplie, ne le passe pas, et prends le temps de le lire. J’écris ces quelques lignes avec le
				cœur (et aucune IA !).
			</MailParagraph>
			<MailParagraph>
				Rapidement : moi, c’est Andy, je suis développeur, et j’ai créé My-Makeup il y a quelques années, pour aider les
				maquilleuses à trouver plus facilement des clients, et permettre aux client.es de trouver plus facilement des
				maquilleuses. Puis j’ai abandonné le projet, et il a été laissé longtemps à l’abandon : c’était une des
				premières plateformes que je développais à l’époque.
			</MailParagraph>
			<MailParagraph>
				Aujourd’hui, j’ai plus de 7 ans d’expérience, et j’ai envie de relancer la plateforme et de la faire fonctionner
				(pour vous aider dans votre quotidien et dans vos recherches à toutes). Mais j’ai besoin de vous, pour :
			</MailParagraph>
			<MailList
				items={[
					'Avoir un retour sur la plateforme : est-ce qu’elle vous plaît ? Est-ce que c’est bien ? Trop compliqué ? Pas assez clair ? Pas assez beau ?',
					'Me donner vos retours : il n’y a aucune idée business dans l’app pour le moment, l’idée, c’est uniquement de vous aider !',
					'Savoir si certaines d’entre vous auraient un peu de temps à m’accorder pour potentiellement m’aider à écrire des choses dans le blog, pour rendre ça plus humain et carrément plus sympa pour les personnes qui viennent sur le site. (Je n’y connais rien en maquillage, moi ;( je ne suis qu’un pauvre geek à l’aide.)',
				]}
			/>
			<MailParagraph>
				Si vous avez la moindre envie de participer au projet, de m’aider un petit peu, avec des idées pour la
				communication, pour faire connaître le site internet, et pour améliorer son contenu, le design, l’utilisation,
				etc., je suis preneur.
			</MailParagraph>
			<MailParagraph>
				<strong style={{ color: MAIL_COLORS.ink }}>PAR PITIÉ, ne prenez pas de pincettes</strong> : j’ai besoin de vrais
				retours, et de retours humains !
			</MailParagraph>
			<MailParagraph>Répondez par mail, à l’une de ces adresses :</MailParagraph>
			<MailList
				items={[
					...(personalEmail
						? [
								<Link key="mail" href={`mailto:${personalEmail}`} style={link}>
									{personalEmail}
								</Link>,
							]
						: []),
					<Link key="contact" href="mailto:contact@my-makeup.fr" style={link}>
						contact@my-makeup.fr
					</Link>,
				]}
			/>
			<MailParagraph>
				Vous pouvez également m’envoyer un message sur{' '}
				<Link href="https://www.instagram.com/cinquin.andy/" style={link}>
					Instagram
				</Link>
				{phone ? `, par WhatsApp, SMS… (${phone})` : ', par WhatsApp, SMS…'} Je peux même accepter les hiboux et les
				pigeons voyageurs, si ça vous arrange ! Tant que j’ai un retour à ce message, c’est la seule chose qui compte.
			</MailParagraph>
			<MailParagraph>
				S’il y en a quelques-unes (je croise les doigts fort fort fort fort fort) qui me répondent, je serais trop
				content de vous proposer ensuite de donner votre avis sur la suite de la vie de la plateforme. Je suis sûr
				qu’elle peut devenir une référence pour la recherche de maquilleuse, et pour la mise en avant de vos services,
				de manière beaucoup hyper quali !
			</MailParagraph>
			<MailParagraph>
				Avec tout l’amour et la bienveillance d’un développeur freelance passionné par le fait d’aider et de faire le
				bien autour de moi avec mes compétences, je vous souhaite une très agréable journée, soirée, matinée.
			</MailParagraph>
			<MailParagraph>Cordialement,</MailParagraph>
		</MakeupMail>
	)
}
