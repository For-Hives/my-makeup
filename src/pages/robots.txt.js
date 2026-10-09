import { robotsTxt } from '@/lib/seo/robots'
import { urlDuSite } from '@/lib/seo/url'

/**
 * /robots.txt (SEO-10): open except the API routes, with the sitemap of
 * this site (NEXT_PUBLIC_URL). /auth and /search are not blocked here: they
 * answer noindex, which a blocked page would never show.
 */
const Robots = () => null

export const getServerSideProps = ({ res }) => {
	res.setHeader('Content-Type', 'text/plain; charset=utf-8')
	res.write(robotsTxt(urlDuSite()))
	res.end()
	return { props: {} }
}

export default Robots
