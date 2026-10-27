import {
	Body,
	Button,
	Column,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Row,
	Section,
	Text,
} from '@react-email/components'
import type { ReactNode } from 'react'
import { MAIL_BODY_FONT, MAIL_COLORS, MAIL_DISPLAY_FONT, MAIL_SITE } from '../tokens'

const OBJECTS = ['lipstick', 'brush', 'mirror', 'lips', 'eyeshadow-palette'] as const

export type MakeupMailProps = {
	/** The line a mail client shows after the subject. */
	preview: string
	/** The small line above the title, in capitals. */
	eyebrow?: string
	/** The title, in two parts: `emphasis` is the one word set in italic and in berry. */
	title?: { before: string; emphasis: string; after?: string }
	/** The body: paragraphs, in order. */
	children: ReactNode
	/** The one button of the mail. `href` is absolute. */
	action?: { label: string; href: string }
	/** Who signs, under the body. */
	signature?: { name: string; role: string }
	/** The unsubscribe link of the footer: one click, no sign-in (issue 1006). Without it, the footer asks to reply instead (a mail sent once to many in blind copy has no link of its own). */
	unsubscribeUrl?: string | undefined
	/** A plain letter: no band, no title, no pink panel of drawings, no footer. Only the logo, the body, the signature and the button. */
	minimal?: boolean
	/** Where the images are served from. The preview points it at the working copy. */
	assetsBase?: string
}

/**
 * The shell of the mails to the artists, in the look of the site: paper, one white card, a Bodoni title with
 * one word in italic, hairlines, a blush panel with five line drawings, a pill button, and the indigo band.
 * Tables and inline styles only, because the mail readers ignore the rest.
 */
export function MakeupMail({
	preview,
	eyebrow,
	title,
	children,
	action,
	signature,
	unsubscribeUrl,
	minimal = false,
	assetsBase = `${MAIL_SITE}/assets/email`,
}: MakeupMailProps) {
	const c = MAIL_COLORS
	return (
		<Html lang="fr">
			<Head>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light only" />
				<meta name="supported-color-schemes" content="light only" />
			</Head>
			<Preview>{preview}</Preview>
			<Body style={{ margin: 0, padding: 0, backgroundColor: c.paper, fontFamily: MAIL_BODY_FONT, color: c.ink }}>
				<Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px 40px' }}>
					<Section style={{ padding: '0 8px 20px' }}>
						<Row>
							<Column style={{ width: 52 }}>
								<Img
									src={`${assetsBase}/logo.png`}
									width={44}
									height={44}
									alt="My Makeup"
									style={{ borderRadius: 12, display: 'block' }}
								/>
							</Column>
							<Column>
								<Text
									style={{
										margin: 0,
										fontFamily: MAIL_DISPLAY_FONT,
										fontSize: 26,
										lineHeight: '44px',
										fontWeight: 500,
										letterSpacing: '-0.01em',
										color: c.ink,
									}}
								>
									My Makeup
								</Text>
							</Column>
						</Row>
					</Section>

					<Section
						style={{
							backgroundColor: c.card,
							borderRadius: 36,
							border: `1px solid ${c.hairline}`,
							padding: '0 0 8px',
						}}
					>
						{!minimal && (
							<>
								<Section style={{ padding: '14px 24px', backgroundColor: c.banner, borderRadius: '36px 36px 0 0' }}>
									<Text
										style={{
											margin: 0,
											textAlign: 'center',
											fontSize: 12,
											lineHeight: '16px',
											letterSpacing: '0.16em',
											textTransform: 'uppercase',
											color: '#ffffff',
											fontWeight: 600,
										}}
									>
										Maquilleuses indépendantes · Partout en France
									</Text>
								</Section>
							</>
						)}

						{!minimal && (
							<>
								<Section style={{ padding: '44px 40px 8px' }}>
									<Text
										style={{
											margin: '0 0 18px',
											fontSize: 12,
											lineHeight: '16px',
											letterSpacing: '0.18em',
											textTransform: 'uppercase',
											color: c.mute,
											fontWeight: 600,
										}}
									>
										{eyebrow}
									</Text>
									<Text
										style={{
											margin: 0,
											fontFamily: MAIL_DISPLAY_FONT,
											fontSize: 38,
											lineHeight: '42px',
											fontWeight: 500,
											letterSpacing: '-0.02em',
											color: c.ink,
										}}
									>
										{title?.before}{' '}
										<span style={{ fontStyle: 'italic', color: c.berry, whiteSpace: 'nowrap' }}>{title?.emphasis}</span>
										{title?.after ? `${/^[.,;:!?]/.test(title.after) ? '' : ' '}${title.after}` : ''}
									</Text>
								</Section>

								<Section style={{ padding: '20px 40px 0' }}>
									<Hr style={{ margin: 0, border: 'none', borderTop: `1px solid ${c.hairline}` }} />
								</Section>
							</>
						)}

						<Section
							style={{
								padding: minimal ? '40px 40px 0' : '28px 40px 0',
								fontSize: 17,
								lineHeight: '27px',
								color: c.mute,
							}}
						>
							{children}
						</Section>

						{signature ? (
							<Section style={{ padding: '28px 40px 4px' }}>
								<Text
									style={{
										margin: 0,
										fontFamily: MAIL_DISPLAY_FONT,
										fontSize: 22,
										lineHeight: '28px',
										fontStyle: 'italic',
										color: c.ink,
									}}
								>
									{signature.name}
								</Text>
								<Text style={{ margin: '2px 0 0', fontSize: 14, lineHeight: '20px', color: c.mute }}>
									{signature.role}
								</Text>
							</Section>
						) : null}

						{action ? (
							<Section style={{ padding: '24px 40px 8px' }}>
								<Button
									href={action.href}
									style={{
										display: 'inline-block',
										backgroundColor: c.ink,
										color: '#ffffff',
										fontFamily: MAIL_BODY_FONT,
										fontSize: 16,
										fontWeight: 600,
										lineHeight: '24px',
										padding: '14px 32px',
										borderRadius: 999,
										textDecoration: 'none',
									}}
								>
									{action.label}
								</Button>
							</Section>
						) : null}

						{!minimal && (
							<>
								<Section style={{ padding: '36px 24px 8px' }}>
									<Section style={{ backgroundColor: c.blush, borderRadius: 28, padding: '22px 12px' }}>
										<Row>
											{OBJECTS.map(name => (
												<Column key={name} align="center" style={{ width: '20%' }}>
													<Img
														src={`${assetsBase}/${name}.png`}
														width={44}
														height={44}
														alt=""
														style={{ display: 'block', margin: '0 auto' }}
													/>
												</Column>
											))}
										</Row>
									</Section>
								</Section>
							</>
						)}
					</Section>

					{!minimal && (
						<>
							<Section style={{ padding: '28px 24px 0', textAlign: 'center' }}>
								<Text style={{ margin: '0 0 8px', fontSize: 13, lineHeight: '20px', color: c.mute }}>
									My Makeup, l’annuaire des maquilleuses professionnelles.{' '}
									<Link href={MAIL_SITE} style={{ color: c.blushInk, textDecoration: 'underline' }}>
										my-makeup.fr
									</Link>
								</Text>
								<Text style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: c.mute }}>
									{unsubscribeUrl ? (
										<>
											Tu ne veux plus recevoir nos courriels d’information ?{' '}
											<Link href={unsubscribeUrl} style={{ color: c.blushInk, textDecoration: 'underline' }}>
												Je me désinscris
											</Link>
											, c’est immédiat.
										</>
									) : (
										'Tu ne veux plus recevoir de message de ma part ? Réponds simplement « stop » à ce courriel.'
									)}
								</Text>
							</Section>
						</>
					)}
				</Container>
			</Body>
		</Html>
	)
}

/** One paragraph of the body. */
export function MailParagraph({ children }: { children: ReactNode }) {
	return <p style={{ margin: '0 0 18px', fontSize: 17, lineHeight: '27px', color: MAIL_COLORS.mute }}>{children}</p>
}

/** A bulleted list of the body, in the look of the paragraphs. */
export function MailList({ items }: { items: readonly ReactNode[] }) {
	return (
		<ul style={{ margin: '0 0 18px', paddingLeft: 22, fontSize: 17, lineHeight: '27px', color: MAIL_COLORS.mute }}>
			{items.map((item, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of the template, never reordered
				<li key={index} style={{ margin: '0 0 8px' }}>
					{item}
				</li>
			))}
		</ul>
	)
}

/** The pill button, for a body that carries it itself (the `action` prop places it after the signature). */
export function MailButton({ href, children }: { href: string; children: ReactNode }) {
	return (
		<Button
			href={href}
			style={{
				display: 'inline-block',
				backgroundColor: MAIL_COLORS.ink,
				color: '#ffffff',
				fontFamily: MAIL_BODY_FONT,
				fontSize: 16,
				fontWeight: 600,
				lineHeight: '24px',
				padding: '14px 32px',
				borderRadius: 999,
				textDecoration: 'none',
			}}
		>
			{children}
		</Button>
	)
}
