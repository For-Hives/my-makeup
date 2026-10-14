/**
 * The GraphQL playground is switched off with the GraphQL API: see ../graphql/route.ts.
 *
 * Payload generated this file as `GRAPHQL_PLAYGROUND_GET(config)`, which shows the playground in
 * development even when GraphQL is disabled. It answers 404 without loading anything.
 */
const notFound = (): Response => new Response(null, { status: 404 })

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const OPTIONS = notFound
