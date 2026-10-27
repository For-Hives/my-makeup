/**
 * The colours and fonts of the mails to the artists. Written out, as in src/lib/emails/layout.ts: a mail
 * reader knows no stylesheet of the site. The values are the tokens of the art direction kit
 * (src/app/(front)/globals.css, block « ART DIRECTION KIT »); docs/courriel-maquilleuses.md says which is which.
 */
export const MAIL_COLORS = {
	paper: '#f1ece7',
	card: '#ffffff',
	ink: '#1a1417',
	mute: '#463b41',
	blush: '#f6dce3',
	blushInk: '#5c1a38',
	berry: '#9e2f5c',
	banner: '#432dd7',
	hairline: '#d9d0d4',
} as const

/** No web font: a mail reader loads none reliably. Bodoni 72 and Didot are on every Apple device; elsewhere a serif. */
export const MAIL_DISPLAY_FONT =
	"'Bodoni Moda', 'Bodoni 72', Didot, 'Playfair Display', Georgia, 'Times New Roman', serif"
export const MAIL_BODY_FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** The address the images are served from: the mail is read outside of the site, so a link is absolute. */
export const MAIL_SITE = 'https://my-makeup.fr'
