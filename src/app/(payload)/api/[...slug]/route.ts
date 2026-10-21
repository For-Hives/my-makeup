/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD, then wrapped by hand (ticket 276). */
import config from '@payload-config'
import '@payloadcms/next/css'
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from '@payloadcms/next/routes'
import { withoutInternalRoutes } from '@/lib/payload-internal-routes'

export const GET = withoutInternalRoutes(REST_GET(config))
export const POST = withoutInternalRoutes(REST_POST(config))
export const DELETE = withoutInternalRoutes(REST_DELETE(config))
export const PATCH = withoutInternalRoutes(REST_PATCH(config))
export const PUT = withoutInternalRoutes(REST_PUT(config))
export const OPTIONS = withoutInternalRoutes(REST_OPTIONS(config))
