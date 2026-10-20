import type { BrowserContext } from '@playwright/test'

/** A transparent 1 x 1 GIF: what stands in for an image from outside the machine. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

const MACHINE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Answers every request of the browser that leaves the machine with an empty image, so that a test that
 * counts the errors of the console does not depend on the network (ticket 225). The admin panel loads the
 * avatar of its account from gravatar.com, the only address outside the machine a page of the site asks
 * (docs/tests/e2e.md, « Pièges »): when the network changes under the run, the console reports the failure
 * and the test fails for a reason that is not the site's. Nothing is sent outside, whatever the answer.
 */
export async function withoutOutsideNetwork(context: BrowserContext): Promise<void> {
	await context.route(
		url => !MACHINE_HOSTS.has(url.hostname) && url.protocol.startsWith('http'),
		route => route.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL })
	)
}
