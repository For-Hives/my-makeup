/**
 * Payload's GraphQL API is switched off.
 *
 * Payload generated this file as `GRAPHQL_POST(config)`. Nothing here reads GraphQL: the site uses
 * the Local API, the admin panel uses REST. Every method answers 404 without loading the Payload
 * configuration, opening a session or reading the body. `graphQL.disable` in src/payload.config.ts
 * switches it off on Payload's side as well.
 *
 * If a Payload upgrade writes this file again, put it back as it is here:
 * tests/unit/payload-config.test.ts checks it.
 */
const notFound = (): Response => new Response(null, { status: 404 })

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const OPTIONS = notFound
