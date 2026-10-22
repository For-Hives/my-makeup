import { profilePath } from '../seo/profile'
import { canonicalUrl } from '../seo/url'

/**
 * The address of her public page, in full, as she gives it out (her Instagram bio, a message): the
 * canonical address of the site, the one the public page itself declares (ticket 306).
 */
export const publicAddress = (slug: string): string => canonicalUrl(profilePath(slug))
