/**
 * The frozen URLs: what every family of addresses of the old site answers once the v3 is
 * live. This table is the source of docs/migration/URLS.md (the tables of that document are
 * written from it by scripts/migration/urls-doc.ts) and of the parity tests.
 *
 * A status is the first answer to an anonymous GET, never the end of a chain: the table
 * allows one redirect at most, straight to an address that answers 200.
 *
 * Nothing here names a real profile: profile addresses are patterns, and their examples are
 * the fictional profiles of the test bench. The wording shown in the document is French.
 */

export const SITE_ORIGIN = 'https://my-makeup.fr'

/** Statuses the table may promise. */
export type FrozenStatus = 200 | 301 | 307 | 308 | 404 | 405

export type UrlKind =
	| 'page'
	| 'profil'
	| 'talent'
	| 'article'
	| 'recherche'
	| 'espace'
	| 'normalisation'
	| 'hote'
	| 'retiree'
	| 'technique'
	| 'verification'
	| 'historique'
	| 'inconnue'

export interface FrozenRedirect {
	/** Destination, as shown in the document (Markdown). */
	to: string
	/** Family of the destination. Left out when it depends on the address (normalisation, hosts). */
	family?: string
}

export interface FrozenUrlExample {
	/** Requested address: a path of the site, or an absolute URL for another origin. */
	from: string
	/** Where the single redirect lands, when the family redirects. */
	to?: string
}

export interface FrozenUrlFamily {
	/** Stable key: the tests and the register of wanted changes refer to it. */
	id: string
	kind: UrlKind
	/** Row of the table of plan 01 §6.3 (1 to 13) this family carries, when it carries one. */
	planRow?: number
	/** Origins the family answers on. The site itself when left out. */
	origins?: readonly string[]
	/**
	 * Paths of the family: literal segments, `<name>` for one segment, a final `*` for any
	 * rest. A shape rule (`rule`) has no pattern.
	 */
	patterns: readonly string[]
	/** Format of the `<name>` segments, when the family only takes some of them. */
	paramFormat?: RegExp
	/** Shape of the path, whatever the page: read before any pattern. */
	rule?: 'double-slash' | 'trailing-slash'
	/**
	 * Condition on the data, shown in the document. Required, and distinct, among the
	 * families that share a pattern: it is what tells them apart.
	 */
	when?: string
	/** First statuses measured on the old site (anonymous GET, reading of 2026-10-14). */
	statusToday: readonly number[]
	/** Expected status after the switch. */
	status: FrozenStatus
	/** Other status accepted, when the answer is not written by the application. */
	alsoAccepted?: readonly FrozenStatus[]
	/** Where a 301, 307 or 308 goes: always in one hop. */
	redirect?: FrozenRedirect
	/** What an anonymous visitor gets instead, when `status` needs a session. */
	withoutSession?: { status: 307; redirect: FrozenRedirect }
	/** SHA-256 of the body the old site serves: the v3 must serve the same bytes. */
	sha256?: string
	/** Who answers: the application, or the hosting in front of it (domains, TLS). */
	servedBy: 'application' | 'hebergement'
	/** Column « Aujourd'hui » of the document. */
	today: string
	/** Column « Après la bascule » of the document. */
	after: string
	examples: readonly FrozenUrlExample[]
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NOT_A_SLUG = /^(?![a-z0-9]+(?:-[a-z0-9]+)*$).+$/
const INDEXNOW_KEY = /^[0-9a-f]{32}$/

const SIGN_IN = '/auth/signin'

export const FROZEN_URL_FAMILIES: readonly FrozenUrlFamily[] = [
	// Public pages
	{
		id: 'accueil',
		kind: 'page',
		patterns: ['/'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Accueil',
		after: 'Identique',
		examples: [{ from: '/' }],
	},
	{
		id: 'pages-fixes',
		kind: 'page',
		patterns: [
			'/a-propos',
			'/contact',
			'/cgu',
			'/politique-de-confidentialite',
			'/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
			'/particulier/trouver-une-maquilleuse',
			'/particulier/centraliser-ses-recherches',
			'/particulier/explorer-les-profils',
			'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
			'/maquilleuse/partenariats',
			'/solutions/pour-les-particuliers',
			'/solutions/pour-les-maquilleuses',
		],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Les 12 pages fixes du sitemap, hors accueil, blog et mentions légales',
		after: 'Identiques',
		examples: [{ from: '/contact' }, { from: '/particulier/trouver-une-maquilleuse' }],
	},
	{
		id: 'mentions-legales',
		kind: 'page',
		planRow: 10,
		patterns: ['/mentions-legales'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Page créée le 08/10/2026',
		after: 'Identique',
		examples: [{ from: '/mentions-legales' }],
	},
	{
		id: 'blog',
		kind: 'page',
		patterns: ['/blog'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Liste du blog',
		after: 'Identique',
		examples: [{ from: '/blog' }],
	},
	{
		id: 'article',
		kind: 'article',
		planRow: 4,
		patterns: ['/blog/<slug>'],
		when: 'article publié',
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Article du blog (10 au relevé)',
		after: 'Identique',
		examples: [{ from: '/blog/cout-maquilleuse-professionnelle-guide-tarifs' }],
	},
	{
		id: 'talent',
		kind: 'talent',
		planRow: 4,
		patterns: ['/talent/<slug>'],
		when: 'page talent publiée',
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Page talent (14 au relevé)',
		after: 'Identique',
		examples: [{ from: '/talent/maquillage-mariee' }],
	},
	{
		id: 'profil',
		kind: 'profil',
		planRow: 1,
		patterns: ['/profil/<slug>'],
		paramFormat: SLUG,
		when: "slug d'un profil repris et visible",
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Profil public, adresse émise depuis le 08/10/2026',
		after: "Identique ; `noindex` tant que le profil n'est pas publiable",
		examples: [{ from: '/profil/zoe-lefevre' }],
	},
	{
		id: 'profil-ancien-nom',
		kind: 'profil',
		planRow: 2,
		patterns: ['/profil/<ancien-nom>'],
		paramFormat: NOT_A_SLUG,
		when: "ancien nom d'utilisateur d'un profil repris, ou variante de son slug (majuscules, accents, espaces)",
		statusToday: [308],
		status: 308,
		redirect: { to: '`/profil/<slug>`', family: 'profil' },
		servedBy: 'application',
		today: "Ancienne forme, encodée dans l'adresse ; déjà en 308 en un saut",
		after: 'Redirection vers le slug du même profil',
		examples: [
			{ from: '/profil/zo%C3%A9%20lef%C3%A8vre', to: '/profil/zoe-lefevre' },
			{ from: '/profil/Zoe-Lefevre', to: '/profil/zoe-lefevre' },
		],
	},
	{
		id: 'profil-non-repris',
		kind: 'profil',
		patterns: ['/profil/<slug>'],
		when: "l'un des 13 profils vides du spam, que l'import ne reprend pas (slug ou ancien nom)",
		statusToday: [200, 308],
		status: 404,
		servedBy: 'application',
		today: "Profil vide, servi en `noindex` (200, ou 308 depuis l'ancien nom)",
		after: 'Page 404 en français ; les 13 sont au registre par numéro, jamais par nom',
		examples: [{ from: '/profil/profil-vide-non-repris' }],
	},
	{
		id: 'slug-inconnu',
		kind: 'inconnue',
		planRow: 11,
		patterns: ['/profil/<slug>', '/talent/<slug>', '/blog/<slug>'],
		when: 'slug inconnu, ou profil masqué',
		statusToday: [404],
		status: 404,
		servedBy: 'application',
		today: 'Slug inconnu',
		after: 'Page 404 en français, jamais 500',
		examples: [
			{ from: '/profil/audit-inexistant-zz9' },
			{ from: '/talent/inexistant-inventaire-zz9' },
			{ from: '/blog/inexistant-inventaire-zz9' },
		],
	},
	{
		id: 'recherche',
		kind: 'recherche',
		planRow: 6,
		patterns: ['/search'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Recherche, `/search?search=&city=`, en `noindex`',
		after: 'Mêmes paramètres, plus `specialite` et `page` ; `noindex`',
		examples: [{ from: '/search' }, { from: '/search?search=mariage&city=Annecy' }, { from: '/search?city=Annecy' }],
	},
	{
		id: 'toutes-les-news',
		kind: 'page',
		planRow: 5,
		patterns: ['/toutes-les-news'],
		statusToday: [200],
		status: 301,
		redirect: { to: '`/blog`', family: 'blog' },
		servedBy: 'application',
		today: 'Liste des articles, en double du blog',
		after: 'Redirection vers la liste du blog',
		examples: [{ from: '/toutes-les-news', to: '/blog' }],
	},
	{
		id: 'plan-du-site',
		kind: 'page',
		planRow: 13,
		patterns: ['/site-map'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Plan du site',
		after: 'Régénéré depuis Payload, profils publiables seulement',
		examples: [{ from: '/site-map' }],
	},
	{
		id: 'demande-envoyee',
		kind: 'page',
		patterns: ['/demande-envoyee'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Page de remerciement, en `noindex`',
		after: 'Identique, en `noindex`',
		examples: [{ from: '/demande-envoyee' }],
	},
	{
		id: 'adresse-inconnue',
		kind: 'inconnue',
		patterns: ['/*'],
		statusToday: [404],
		status: 404,
		servedBy: 'application',
		today: 'Toute autre adresse',
		after: 'Page 404 en français, jamais 500',
		examples: [{ from: '/page-inexistante-audit-zz' }, { from: '/404' }, { from: '/Blog' }],
	},

	// Shape of the path
	{
		id: 'double-barre',
		kind: 'normalisation',
		planRow: 3,
		patterns: [],
		rule: 'double-slash',
		statusToday: [200],
		status: 301,
		redirect: { to: 'le même chemin sans barre en double, ou la destination de sa propre règle' },
		servedBy: 'application',
		today: '`//profil/…` et toute adresse avec `//` : servie en 200, en double de la page',
		after: 'Redirection vers le chemin normalisé',
		examples: [
			{ from: '//blog', to: '/blog' },
			{ from: '//profil/zoe-lefevre', to: '/profil/zoe-lefevre' },
			{ from: '//toutes-les-news', to: '/blog' },
		],
	},
	{
		id: 'barre-finale',
		kind: 'normalisation',
		patterns: [],
		rule: 'trailing-slash',
		statusToday: [308],
		status: 308,
		redirect: { to: 'le même chemin sans barre finale, ou la destination de sa propre règle' },
		servedBy: 'application',
		today: 'Adresse terminée par `/` : déjà en 308 en un saut',
		after: 'Redirection, paramètres gardés',
		examples: [
			{ from: '/blog/', to: '/blog' },
			{ from: '/talent/maquillage-mariee/', to: '/talent/maquillage-mariee' },
			{ from: '/search/?city=Annecy', to: '/search?city=Annecy' },
			{ from: '/toutes-les-news/', to: '/blog' },
		],
	},

	// Hosts
	{
		id: 'http',
		kind: 'hote',
		origins: ['http://my-makeup.fr'],
		patterns: ['/*'],
		statusToday: [302],
		status: 301,
		alsoAccepted: [308],
		redirect: { to: 'le même chemin sur `https://my-makeup.fr`' },
		servedBy: 'hebergement',
		today: 'Redirection temporaire (302)',
		after: 'Redirection permanente',
		examples: [
			{ from: 'http://my-makeup.fr/', to: '/' },
			{ from: 'http://my-makeup.fr/blog', to: '/blog' },
		],
	},
	{
		id: 'www',
		kind: 'hote',
		origins: ['https://www.my-makeup.fr', 'http://www.my-makeup.fr'],
		patterns: ['/*'],
		statusToday: [302],
		status: 301,
		alsoAccepted: [308],
		redirect: { to: 'le même chemin sur `https://my-makeup.fr`' },
		servedBy: 'hebergement',
		today: 'Redirection temporaire (302), en deux sauts depuis `http://www`',
		after: 'Redirection permanente',
		examples: [
			{ from: 'https://www.my-makeup.fr/', to: '/' },
			{ from: 'https://www.my-makeup.fr/blog', to: '/blog' },
			{ from: 'http://www.my-makeup.fr/', to: '/' },
		],
	},
	{
		id: 'ancienne-api',
		kind: 'hote',
		planRow: 12,
		origins: ['https://api.my-makeup.fr', 'http://api.my-makeup.fr'],
		patterns: ['/*'],
		statusToday: [200, 302],
		status: 301,
		redirect: { to: "l'accueil du site, `https://my-makeup.fr/`", family: 'accueil' },
		servedBy: 'hebergement',
		today: "L'API Strapi",
		after: "Redirection pendant 6 mois à compter de l'arrêt de Strapi, 30 jours après la bascule",
		examples: [{ from: 'https://api.my-makeup.fr/', to: '/' }],
	},

	// The makeup artist's space
	{
		id: 'espace-connexion',
		kind: 'espace',
		planRow: 7,
		patterns: [SIGN_IN, '/auth/signup', '/auth/mot-de-passe-oublie', '/auth/reinitialiser'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Connexion, inscription, mot de passe oublié, réinitialisation',
		after: 'Mêmes chemins, `noindex`, `private, no-store`',
		examples: [{ from: SIGN_IN }, { from: '/auth/signup' }, { from: '/auth/reinitialiser' }],
	},
	{
		id: 'espace-prive',
		kind: 'espace',
		planRow: 7,
		patterns: ['/auth/profil', '/auth/apercu-profil', '/auth/init-account'],
		statusToday: [307],
		status: 200,
		withoutSession: {
			status: 307,
			redirect: { to: '`/auth/signin?callbackUrl=<chemin>`', family: 'espace-connexion' },
		},
		servedBy: 'application',
		today: 'Espace et onboarding ; sans session, une 307 en un saut vers la connexion',
		after: 'Mêmes chemins, `noindex`, `private, no-store`',
		examples: [
			{ from: '/auth/profil', to: '/auth/signin?callbackUrl=%2Fauth%2Fprofil' },
			{ from: '/auth/apercu-profil', to: '/auth/signin?callbackUrl=%2Fauth%2Fapercu-profil' },
			{ from: '/auth/init-account', to: '/auth/signin?callbackUrl=%2Fauth%2Finit-account' },
		],
	},
	{
		id: 'espace-verification',
		kind: 'espace',
		planRow: 8,
		patterns: ['/auth/verification-complete', '/auth/verification-wall'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: "Mur de vérification et confirmation de l'email (`/auth/verification-*`)",
		after: 'Mêmes chemins, `noindex`',
		examples: [{ from: '/auth/verification-wall' }, { from: '/auth/verification-complete' }],
	},
	{
		id: 'espace-racine',
		kind: 'espace',
		patterns: ['/auth'],
		statusToday: [200],
		status: 307,
		redirect: { to: '`/auth/signin` (avec une session : `/auth/profil`)', family: 'espace-connexion' },
		servedBy: 'application',
		today: 'Page vide en 200, puis redirection par le navigateur',
		after: 'Redirection par le serveur',
		examples: [{ from: '/auth', to: SIGN_IN }],
	},
	{
		id: 'espace-erreur',
		kind: 'espace',
		patterns: ['/auth/error'],
		statusToday: [307, 200],
		status: 200,
		servedBy: 'application',
		today: "Page d'erreur ; sans code, une 307 vers elle-même avec `?error=erreur-inconnue`",
		after: "Page d'erreur en français, `noindex`, avec ou sans code",
		examples: [{ from: '/auth/error' }, { from: '/auth/error?error=erreur-inconnue' }],
	},

	{
		id: 'espace-google',
		kind: 'espace',
		patterns: ['/auth/google', '/auth/google/callback'],
		statusToday: [404],
		status: 307,
		redirect: {
			to: "Google (`accounts.google.com`) pour le départ ; pour le retour, l'espace ou `/auth/signin?error=<code>`",
			family: 'espace-connexion',
		},
		servedBy: 'application',
		today:
			"Le bouton Google passait par NextAuth (`/api/auth/signin/google`, `/api/auth/callback/google`) ; ces deux chemins n'existent plus (404)",
		after:
			'Nouveau : départ et retour de la connexion Google (`/auth/google`, `/auth/google/callback`), `noindex`, `private, no-store`. Adresse de retour à déclarer dans la console Google',
		examples: [{ from: '/auth/google/callback', to: '/auth/signin?error=google-echec' }],
	},

	// Routes of the old code
	{
		id: 'api-nextauth',
		kind: 'retiree',
		planRow: 9,
		patterns: ['/api/auth/*'],
		statusToday: [200, 302, 404],
		status: 404,
		servedBy: 'application',
		today: 'Routes de NextAuth (200, 302 ou 404 selon la route)',
		after: 'Supprimées',
		examples: [{ from: '/api/auth/signin' }, { from: '/api/auth/providers' }, { from: '/api/auth/session' }],
	},
	{
		id: 'api-sendmail',
		kind: 'retiree',
		planRow: 9,
		patterns: ['/api/sendMail'],
		statusToday: [405],
		status: 404,
		servedBy: 'application',
		today: 'Envoi du formulaire de contact, en POST seulement (un GET répond 405)',
		after: 'Supprimée',
		examples: [{ from: '/api/sendMail' }],
	},

	// Technical addresses
	{
		id: 'sante',
		kind: 'technique',
		patterns: ['/api/health'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Route de santé',
		after: 'Même chemin, mêmes clés ; 503 quand la base ne répond pas',
		examples: [{ from: '/api/health' }],
	},
	{
		id: 'mesure-script',
		kind: 'technique',
		patterns: ['/u/script.js'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Script de mesure Umami, relayé par le site',
		after: 'Identique',
		examples: [{ from: '/u/script.js' }],
	},
	{
		id: 'mesure-envoi',
		kind: 'technique',
		patterns: ['/u/api/send'],
		statusToday: [405],
		status: 405,
		servedBy: 'application',
		today: 'Envoi des mesures à Umami, en POST seulement (un GET répond 405)',
		after: 'Identique : un GET répond 405, un POST est relayé',
		examples: [{ from: '/u/api/send' }],
	},
	{
		id: 'mesure-autre',
		kind: 'technique',
		patterns: ['/u/*'],
		statusToday: [404],
		status: 404,
		servedBy: 'application',
		today: 'Tout autre chemin sous `/u`',
		after: "Identique : rien d'autre n'est relayé",
		examples: [{ from: '/u' }, { from: '/u/autre-chemin' }],
	},
	{
		id: 'sitemap',
		kind: 'technique',
		planRow: 13,
		patterns: ['/sitemap.xml'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Sitemap',
		after: 'Régénéré depuis Payload, profils publiables seulement',
		examples: [{ from: '/sitemap.xml' }],
	},
	{
		id: 'robots',
		kind: 'technique',
		planRow: 13,
		patterns: ['/robots.txt'],
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Fichier robots',
		after: 'Généré par le site, mêmes règles',
		examples: [{ from: '/robots.txt' }],
	},
	{
		id: 'fichiers-publics',
		kind: 'technique',
		patterns: ['/favicon.webp', '/assets/*'],
		when: 'fichier présent dans `public/`',
		statusToday: [200],
		status: 200,
		servedBy: 'application',
		today: 'Icône du site et images de `public/assets/`',
		after: 'Identiques : le dossier `public/` est conservé',
		examples: [{ from: '/favicon.webp' }, { from: '/assets/og-my-makeup.jpg' }],
	},

	// Verification files of the search engines
	{
		id: 'verification-bing',
		kind: 'verification',
		patterns: ['/BingSiteAuth.xml'],
		statusToday: [200],
		status: 200,
		sha256: '12e539a0ac4a54701695fb2229eb6ee74f02143c285487b099be6b5d7e993fea',
		servedBy: 'application',
		today: 'Fichier de vérification de Bing Webmaster Tools',
		after: "Même contenu, à l'octet près",
		examples: [{ from: '/BingSiteAuth.xml' }],
	},
	{
		id: 'verification-indexnow',
		kind: 'verification',
		patterns: ['/<clé>.txt'],
		paramFormat: INDEXNOW_KEY,
		statusToday: [200],
		status: 200,
		sha256: '3bdd0522dcb8084ae2ac7a28e4f553385d0fc19bf6c8426f57ca232399aad701',
		servedBy: 'application',
		today: 'Fichier de clé IndexNow : la clé fait 32 caractères hexadécimaux',
		after: 'Même adresse et même contenu : la clé elle-même',
		examples: [{ from: '/00000000000000000000000000000000.txt' }],
	},

	// Old 404s, kept
	{
		id: 'historiques',
		kind: 'historique',
		patterns: [
			'/maquilleuse',
			'/particulier',
			'/maquilleuse/partenaires',
			'/affiliation',
			'/cgv',
			'/help',
			'/parrainage',
			'/recrutement',
			'/deposer-un-projet',
			'/profil',
			'/signin',
			'/signup',
		],
		statusToday: [404],
		status: 404,
		servedBy: 'application',
		today: 'Les 12 routes supprimées ou renommées en 2023',
		after: 'Page 404 en français, attendue',
		examples: [{ from: '/signin' }, { from: '/profil' }, { from: '/maquilleuse' }],
	},
	{
		id: 'llms-txt',
		kind: 'historique',
		patterns: ['/llms.txt'],
		statusToday: [404],
		status: 404,
		servedBy: 'application',
		today: 'Fichier pour les assistants, jamais créé',
		after: 'Page 404, attendue : ce fichier dépasse la parité, il se décide après la bascule',
		examples: [{ from: '/llms.txt' }],
	},
]

export interface Unwanted404 {
	path: string
	/** What the address was, and since when it answers 404. */
	was: string
	/** Page that took over, when there is one. */
	successor?: string
	/** Why the 404 is kept after the switch. */
	reason: string
}

const EMPTY_PAGE = "Page d'attente sans contenu (un titre seul)"
const NO_SUCCESSOR = "Rien ne l'a remplacée, et plus aucun lien du site n'y mène."
const MOVED =
	"Aucune impression sur 28 jours au relevé Search Console du 13/10/2026, et plus aucun lien du site n'y mène."

/**
 * The 13 addresses that answered an unwanted 404 on 2026-10-09, one by one. All of them
 * keep their 404: the table names them, so the 404 is now an expected one.
 */
export const UNWANTED_404_OF_2026_10_09: readonly Unwanted404[] = [
	{
		path: '/llms.txt',
		was: 'Jamais créé',
		reason: 'Le fichier pour les assistants dépasse la parité : il attend une décision, après la bascule.',
	},
	{
		path: '/maquilleuse',
		was: 'Page renommée le 18/06/2023',
		successor: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
		reason: MOVED,
	},
	{
		path: '/particulier',
		was: 'Page renommée le 18/06/2023',
		successor: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
		reason: MOVED,
	},
	{
		path: '/maquilleuse/partenaires',
		was: `${EMPTY_PAGE}, supprimée le 16/06/2023`,
		successor: '/maquilleuse/partenariats',
		reason: "La page des partenariats existait déjà à côté ; celle-ci n'a jamais eu de contenu.",
	},
	{ path: '/affiliation', was: `${EMPTY_PAGE}, supprimée le 16/06/2023`, reason: NO_SUCCESSOR },
	{
		path: '/cgv',
		was: `${EMPTY_PAGE}, supprimée le 16/06/2023`,
		reason: "Le site ne vend rien : il n'a pas de conditions de vente. Les CGU sont un autre texte.",
	},
	{ path: '/help', was: `${EMPTY_PAGE}, supprimée le 16/06/2023`, reason: NO_SUCCESSOR },
	{ path: '/parrainage', was: `${EMPTY_PAGE}, supprimée le 16/06/2023`, reason: NO_SUCCESSOR },
	{ path: '/recrutement', was: `${EMPTY_PAGE}, supprimée le 16/06/2023`, reason: NO_SUCCESSOR },
	{ path: '/deposer-un-projet', was: `${EMPTY_PAGE}, supprimée le 29/04/2023`, reason: NO_SUCCESSOR },
	{
		path: '/profil',
		was: 'Espace maquilleuse, déplacé le 12/06/2023',
		successor: '/auth/profil',
		reason: `${MOVED} Une redirection vers une page privée ferait deux sauts pour une visiteuse sans session.`,
	},
	{ path: '/signin', was: 'Connexion, déplacée le 12/06/2023', successor: SIGN_IN, reason: MOVED },
	{ path: '/signup', was: 'Inscription, déplacée le 12/06/2023', successor: '/auth/signup', reason: MOVED },
]

/**
 * Prefixes the table says nothing about beyond the addresses it names: the back office and
 * the API of Payload are new, and the build files change with every deployment.
 */
export const UNFROZEN_PREFIXES: readonly string[] = ['/admin', '/api', '/_next']

/** Status of the first answer to an anonymous GET. */
export function anonymousStatus(family: FrozenUrlFamily): FrozenStatus {
	return family.withoutSession?.status ?? family.status
}

/** True when an anonymous GET is answered by a redirect. */
export function redirects(family: FrozenUrlFamily): boolean {
	return [301, 307, 308].includes(anonymousStatus(family))
}

export interface AddressParts {
	origin: string
	path: string
	/** Query string, with its `?`, or ''. */
	search: string
}

/**
 * Splits an address without normalising it: `//blog` stays a path of the site (the URL
 * parser would read `blog` as a host).
 */
export function splitAddress(address: string): AddressParts {
	const absolute = /^(https?:\/\/[^/?#]+)(.*)$/i.exec(address)
	const origin = absolute?.[1]?.toLowerCase() ?? SITE_ORIGIN
	const rest = (absolute ? absolute[2] : address) ?? ''
	const withoutHash = rest.split('#', 1)[0] ?? ''
	const mark = withoutHash.indexOf('?')
	const path = mark === -1 ? withoutHash : withoutHash.slice(0, mark)
	return { origin, path: path === '' ? '/' : path, search: mark === -1 ? '' : withoutHash.slice(mark) }
}

const isParam = (segment: string): boolean => segment.startsWith('<')

/** Literal end of a parameter segment: `.txt` for `<clé>.txt`, nothing for `<slug>`. */
function paramSuffix(segment: string): string {
	return segment.slice(segment.indexOf('>') + 1)
}

/**
 * A pattern without its parameter names: two families share a pattern when they share this
 * shape.
 */
export function patternShape(pattern: string): string {
	return pattern.replace(/<[^>]*>/g, '<>')
}

/**
 * How closely a pattern fits a path, or null when it does not: a literal segment counts
 * more than a parameter, a parameter more than the final `*`.
 */
function patternScore(pattern: string, path: string, paramFormat: RegExp | undefined): number | null {
	const wanted = pattern.split('/').slice(1)
	const given = path.split('/').slice(1)
	let score = 0
	for (const [index, segment] of wanted.entries()) {
		if (segment === '*' && index === wanted.length - 1) return score + 1
		const value = given[index]
		if (value === undefined) return null
		if (isParam(segment)) {
			const suffix = paramSuffix(segment)
			if (value === '' || !value.endsWith(suffix)) return null
			const param = value.slice(0, value.length - suffix.length)
			if (param === '' || (paramFormat !== undefined && !paramFormat.test(param))) return null
			score += 10
		} else {
			if (value !== segment) return null
			score += 100
		}
	}
	return given.length === wanted.length ? score : null
}

function familyScore(family: FrozenUrlFamily, path: string): number | null {
	let best: number | null = null
	for (const pattern of family.patterns) {
		const score = patternScore(pattern, path, family.paramFormat)
		if (score !== null && (best === null || score > best)) best = score
	}
	return best
}

const underUnfrozenPrefix = (path: string): boolean =>
	UNFROZEN_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))

const onOrigin = (family: FrozenUrlFamily, origin: string): boolean =>
	(family.origins ?? [SITE_ORIGIN]).includes(origin)

/**
 * The families an address may belong to. One family for most addresses; the families that
 * share a pattern when only the data can tell them apart (a known slug, an unknown one);
 * none when the table says nothing of the address (`/admin`, the API of Payload, `/_next`).
 *
 * Order of reading, the one of the site: the host first, then the shape of the path, then
 * the closest pattern.
 */
export function familiesFor(
	address: string,
	families: readonly FrozenUrlFamily[] = FROZEN_URL_FAMILIES
): FrozenUrlFamily[] {
	const { origin, path } = splitAddress(address)
	if (origin !== SITE_ORIGIN) return families.filter(family => family.origins?.includes(origin))

	const collapsed = path.replace(/\/{2,}/g, '/')
	if (!underUnfrozenPrefix(collapsed)) {
		if (collapsed !== path) return families.filter(family => family.rule === 'double-slash')
		if (path.length > 1 && path.endsWith('/')) return families.filter(family => family.rule === 'trailing-slash')
	}

	let best = 0
	let found: FrozenUrlFamily[] = []
	for (const family of families) {
		if (family.rule !== undefined || !onOrigin(family, origin)) continue
		const score = familyScore(family, path)
		if (score === null || score < best) continue
		if (score > best) found = []
		best = score
		found.push(family)
	}
	// Only the catch-all fits: under a prefix the table does not freeze, it says nothing.
	return best <= 1 && underUnfrozenPrefix(collapsed) ? [] : found
}

/**
 * The families of an address whose status on the old site is known: among `familiesFor`,
 * those that were measured with that status. One family, unless only the register can tell
 * (a profile that is not taken over answers like any other today).
 */
export function familiesMeasured(
	address: string,
	statusToday: number,
	families: readonly FrozenUrlFamily[] = FROZEN_URL_FAMILIES
): FrozenUrlFamily[] {
	return familiesFor(address, families).filter(family => family.statusToday.includes(statusToday))
}
