/**
 * The clicks the markup reports by itself (27/10/2026): one listener on the page reads data attributes, so the links of
 * the foot, the bar, the cards and the share buttons stay server markup, with no client component of their own.
 *
 * | Attribute on the link or an ancestor | Event |
 * |---|---|
 * | `data-cta="<where>"` | `cta_click` with `where` and the route of the page |
 * | `data-share="<network>"` | `share_click` |
 * | `data-card-origin="<origin>"` and `data-card-pid` | `card_click`, with the rank among the cards in view |
 * | an in-text link inside `[data-article-body]` | `article_link_click` with the kind of the destination |
 *
 * A link that already has its own event (`TrackedLink`, `TrackedContactLink`) carries none of these attributes, so no
 * click counts twice. Nothing of the address, of the text of the link or of the page is sent: closed words, a route
 * with its parameters named, a rank, the `pid` of a profile. The values are checked again by `track`.
 */

import type { MyMakeupEvents } from './events'
import type { Track } from './track'
import { articleLinkKind, routeOf } from './values'

/**
 * The page the visitor left by a link of the site, until the next page reads it: the browser's `referrer` does not
 * change when Next moves from page to page, so the view of a profile tells where it came from through this.
 */
export const leftPage: { from: string | null } = { from: null }

/** What of the browser the decision reads. */
export interface ClickWorld {
	/** `location.origin` */
	origin: string
	/** `location.pathname` */
	path: string
}

function leadsInsideTheSite(href: string, origin: string): boolean {
	if (href === '' || href.startsWith('#')) return false
	return URL.canParse(href, origin) && new URL(href, origin).origin === origin
}

/** The rank (1-based) of the card of the link among the cards that are in view in its list. */
function rankInView(link: Element): number {
	let rank = 1
	for (let before = link.closest('li')?.previousElementSibling; before; before = before.previousElementSibling) {
		// A card hidden by the stylesheet (the draw of « Mise en avant ») has no box.
		if (before.getClientRects().length > 0) rank += 1
	}
	return Math.min(rank, 999)
}

const attribute = (link: Element, name: string): string | null => link.closest(`[${name}]`)?.getAttribute(name) ?? null

/** Reports what a click on `target` tells the measure, if it is one of the clicks above. Never throws. */
export function measureDelegatedClick(target: Element | null, world: ClickWorld, report: Track): void {
	try {
		const link = target?.closest('a')
		if (!link) return
		const href = link.getAttribute('href') ?? ''
		if (leadsInsideTheSite(href, world.origin)) leftPage.from = world.path
		const page = routeOf(world.path)

		const cta = attribute(link, 'data-cta')
		if (cta !== null) report('cta_click', { where: cta as MyMakeupEvents['cta_click']['where'], page })

		const network = attribute(link, 'data-share')
		if (network !== null) report('share_click', { network: network as MyMakeupEvents['share_click']['network'], page })

		const origin = attribute(link, 'data-card-origin')
		const pid = attribute(link, 'data-card-pid')
		if (origin !== null && pid !== null) {
			report('card_click', {
				origin: origin as MyMakeupEvents['card_click']['origin'],
				rank: rankInView(link),
				pid: /^\d+$/.test(pid) ? Number(pid) : (pid as MyMakeupEvents['card_click']['pid']),
			})
		}

		if (link.closest('[data-article-body]') && href !== '' && !href.startsWith('#'))
			report('article_link_click', { kind: articleLinkKind(href, world.origin), page })
	} catch {
		// A measure never breaks a page.
	}
}
