import { pick } from './blog-art'

/**
 * A generated cover illustration of the blog (issue 1136). Every file is 1200 x 800 (3:2) and crops cleanly to the
 * three shapes of a blog panel (5:4, 4:3 and 16:7) with `object-fit: cover`: the subject sits in the middle of the
 * frame with clear paper around it. The prompts, the model and the settings are in `docs/illustrations.md`.
 */
export interface BlogCover {
	/** The file under `public/`. */
	src: string
	width: 1200
	height: 800
	/**
	 * The `object-position` of the crop. The 5:4 and 4:3 cards only trim the sides; the 16:7 banner of an article keeps
	 * 66% of the height, so this is the vertical place that keeps the heads (the subjects are about 80% of the height).
	 */
	position: string
}

const cover = (name: string, position = 'center'): BlogCover => ({
	src: `/assets/blog/${name}.webp`,
	width: 1200,
	height: 800,
	position,
})

/** The ten illustrations, by what they show. The order is part of the pool: do not reorder (a new slug would change picture). */
export const BLOG_COVERS = {
	makeupTrial: cover('makeup-trial', 'center 16%'),
	weddingMorning: cover('wedding-morning', 'center 25%'),
	productFlatLay: cover('product-flat-lay', 'center 50%'),
	onlinePresence: cover('online-presence', 'center 50%'),
	eveningLook: cover('evening-look', 'center 27%'),
	beginnerPractice: cover('beginner-practice', 'center 21%'),
	photoShoot: cover('photo-shoot', 'center 33%'),
	skincareMoment: cover('skincare-moment', 'center 30%'),
	proKitCase: cover('pro-kit-case', 'center 25%'),
	trendProfile: cover('trend-profile', 'center 33%'),
} as const satisfies Record<string, BlogCover>

/** The pool a slug without a dedicated picture is drawn from. */
export const COVER_POOL: readonly BlogCover[] = Object.values(BLOG_COVERS)

/** The articles whose subject has its own illustration (their addresses are the ones of the site, ten of them). */
const DEDICATED: Readonly<Record<string, BlogCover>> = {
	'essai-maquillage-mariee': BLOG_COVERS.makeupTrial,
	'quand-reserver-maquilleuse-mariage': BLOG_COVERS.weddingMorning,
	'prix-maquillage-mariee-2027': BLOG_COVERS.productFlatLay,
	'fiche-google-maquilleuse': BLOG_COVERS.onlinePresence,
	'choisir-maquilleuse-professionnelle-evenement': BLOG_COVERS.eveningLook,
	'conseils-maquillage-professionnels-debutants': BLOG_COVERS.beginnerPractice,
	'conseils-visibilite-maquilleuse-professionnelle': BLOG_COVERS.photoShoot,
	'cout-maquilleuse-professionnelle-guide-tarifs': BLOG_COVERS.skincareMoment,
	'maximiser-investissement-maquilleuse-professionnelle': BLOG_COVERS.proKitCase,
	'tendances-maquillage-professionnel': BLOG_COVERS.trendProfile,
}

/**
 * The cover of an article: its own illustration when its subject has one, else one drawn from the pool by the slug
 * (the same article always gets the same picture, from the list to its page). `null` when the pool is empty: the
 * caller then draws the tinted panel of `blogArt`. `pool` is a parameter for the tests.
 */
export function blogCover(slug: string, pool: readonly BlogCover[] = COVER_POOL): BlogCover | null {
	if (pool.length === 0) return null
	const own = DEDICATED[slug]
	if (own && pool.includes(own)) return own
	return pick(slug, pool, 41)
}
