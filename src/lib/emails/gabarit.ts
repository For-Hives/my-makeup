/**
 * The common template of every email of the application (ticket 073): one layout, one tone (« tu »),
 * one footer, and a text part that says the same as the HTML part.
 *
 *   const email = composerEmail({
 *     sujet: 'Confirme ton adresse',
 *     titre: 'Bienvenue sur My Makeup',
 *     paragraphes: ['Un clic et ton compte est prêt.'],
 *     action: { libelle: 'Confirmer mon adresse', chemin: `/auth/confirmer?code=${code}` },
 *   }, siteUrl)
 *
 * A link is given as a path of the site and leaves absolute: a mail is read outside of the site, where
 * a relative link leads nowhere. The path is never copied into an error, because it may hold a token.
 *
 * Pure: no `next` import, no Payload, nothing to send. The sending is in ./envoi.ts.
 */

/** What an email says. Every text is plain text: the template escapes it for the HTML part. */
export type ContenuEmail = {
	/** The subject, on one line. */
	sujet: string
	/** The heading of the mail. */
	titre: string
	/** The paragraphs, in order. */
	paragraphes: readonly string[]
	/** The one button of the mail, when it has one. `chemin` is a path of the site: « /auth/... ». */
	action?: { libelle: string; chemin: string }
}

/** The mail as it leaves: both parts, and the absolute link of the button. */
export type EmailComposé = {
	sujet: string
	texte: string
	html: string
	/** The absolute link of the button, when the mail has one. */
	lien?: string
}

/** The content or the address of a mail is refused. The message names the problem, never a value. */
export class EmailInvalide extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'EmailInvalide'
	}
}

/** The footer of every mail. */
export const PIED_DE_EMAIL =
	'Cet email a été envoyé automatiquement par My Makeup. Tu n’as rien demandé ? Tu peux l’ignorer.'

const SANS_SAUT_DE_LIGNE = /^[^\p{Cc}]+$/u

/** A subject or a label holds one line: a line break would write a header of its own into the mail. */
export function exigerUneLigne(texte: string, nom: string): string {
	if (!SANS_SAUT_DE_LIGNE.test(texte.trim()))
		throw new EmailInvalide(`${nom} de l’email : une ligne de texte, non vide.`)
	return texte.trim()
}

/**
 * The absolute link of a path of the site. Refuses a path that leaves the site (« //autre.test »,
 * « https://autre.test »), and a site that is not an http(s) origin.
 */
export function lienAbsolu(site: string, chemin: string): string {
	let origine: URL
	try {
		origine = new URL(site)
	} catch {
		throw new EmailInvalide('L’adresse du site est illisible : aucun lien absolu ne peut être composé.')
	}
	if (origine.protocol !== 'https:' && origine.protocol !== 'http:')
		throw new EmailInvalide('L’adresse du site doit commencer par https:// ou http://.')
	if (!/^\/(?![/\\])[^\p{Cc}\s\\]*$/u.test(chemin))
		throw new EmailInvalide('Le lien de l’email doit être un chemin du site, comme « /auth/connexion ».')
	const lien = new URL(chemin, origine.origin)
	if (lien.origin !== origine.origin) throw new EmailInvalide('Le lien de l’email doit rester sur le site.')
	return lien.href
}

const ECHAPPEMENTS: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Text made safe to sit in the body or in an attribute of the HTML part. */
export function echapperHtml(texte: string): string {
	return texte.replace(/[&<>"']/g, caractere => ECHAPPEMENTS[caractere] ?? caractere)
}

// Colours are written out: a mail reader knows no stylesheet of the site.
const POLICE = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** Composes the two parts of a mail from its content. `site` is the address the site is served from. */
export function composerEmail(contenu: ContenuEmail, site: string): EmailComposé {
	const sujet = exigerUneLigne(contenu.sujet, 'Le sujet')
	const titre = exigerUneLigne(contenu.titre, 'Le titre')
	const paragraphes = contenu.paragraphes.map(paragraphe => paragraphe.trim()).filter(paragraphe => paragraphe !== '')
	if (paragraphes.length === 0) throw new EmailInvalide('Un email dit au moins une phrase.')
	const action = contenu.action
		? {
				libelle: exigerUneLigne(contenu.action.libelle, 'Le libellé du bouton'),
				lien: lienAbsolu(site, contenu.action.chemin),
			}
		: undefined

	const texte = [
		titre,
		'',
		...paragraphes.flatMap(paragraphe => [paragraphe, '']),
		...(action ? [`${action.libelle} : ${action.lien}`, ''] : []),
		'--',
		PIED_DE_EMAIL,
	].join('\n')

	const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapperHtml(sujet)}</title>
</head>
<body style="margin:0;padding:24px;background:#f6f3f1;font-family:${POLICE};color:#2b2024;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;">
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${echapperHtml(titre)}</h1>
${paragraphes.map(paragraphe => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${echapperHtml(paragraphe)}</p>`).join('\n')}
${
	action
		? `<p style="margin:24px 0;"><a href="${echapperHtml(action.lien)}" style="display:inline-block;padding:12px 24px;background:#b0245a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${echapperHtml(action.libelle)}</a></p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#6b5a60;">Le bouton ne marche pas ? Copie ce lien dans ton navigateur : <a href="${echapperHtml(action.lien)}" style="color:#b0245a;word-break:break-all;">${echapperHtml(action.lien)}</a></p>`
		: ''
}
<hr style="border:none;border-top:1px solid #e8dfe2;margin:24px 0;">
<p style="margin:0;font-size:13px;line-height:1.5;color:#6b5a60;">${echapperHtml(PIED_DE_EMAIL)}</p>
</td></tr>
</table>
</body>
</html>
`
	return { sujet, texte, html, ...(action && { lien: action.lien }) }
}
