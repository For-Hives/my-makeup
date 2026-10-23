import type { Route } from '@playwright/test'

/**
 * A server that answers late, for a test of how the crawl waits (issue 997). The delay is the latency of the server
 * the page talks to, not a pause of the test: the test itself waits for a condition (the crawl returns), never for a
 * duration (guard C06, which reads tests/e2e only).
 */
export async function answerLate(
	route: Route,
	latencyMs: number,
	response: Parameters<Route['fulfill']>[0]
): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, latencyMs))
	await route.fulfill(response)
}
