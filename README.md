# My Makeup

Annuaire de maquilleuses professionnelles indépendantes : [my-makeup.fr](https://my-makeup.fr).

## Branche `v3`

Cette branche porte la réécriture du site : une seule application Next.js et Payload, en TypeScript strict.

- Le site en ligne reste celui de la branche `main` tant que la bascule n'a pas eu lieu.
- **La v3 n'a pas de préprod** (décision d'Andy du 16/10/2026) : il n'y a qu'un seul environnement en ligne, la production, et le banc de test local. Tout ce qui servait la préprod a été retiré (ticket 232).
- L'ancien code (Next.js 15 en JavaScript, branché sur l'API Strapi) a été retiré de cette branche. Il reste lisible sur `main` et dans l'historique.
- `public/` est conservé : il contient le fichier de vérification de Bing et les images du site, qui doivent continuer à répondre à la racine. La clé IndexNow n'en fait plus partie : elle vient de la variable `INDEXNOW_KEY` (ticket 219).
- `dev-assets/` est conservé : ce sont les sources de design.

## Suivre la migration

Les documents, sous `docs/migration/` :

- [`CHANGEMENTS-VOULUS.md`](docs/migration/CHANGEMENTS-VOULUS.md) : le registre de tout ce que la v3 fait autrement que le site actuel, par décision. À la répétition de la bascule, seuls ces écarts sont acceptés.
- [`JOURNAL.md`](docs/migration/JOURNAL.md) : les faits datés de la migration.
- [`SCHEMA.md`](docs/migration/SCHEMA.md) : le schéma gelé. Il dit où va chaque champ de l'ancienne API dans la v3, ou pourquoi il n'est pas repris.
- [`URLS.md`](docs/migration/URLS.md) : les URL gelées. Il dit ce que répond chaque famille d'adresses après la bascule.
- [`GEL.md`](docs/migration/GEL.md) : le gel de l'ancien site. Il dit quand il commence (au départ de la répétition de la bascule), ce qui reste permis après (sécurité, bandeau, lecture seule, contenus), et la commande `bun run migration:freeze` qui le contrôle.
- [`IMPORT.md`](docs/migration/IMPORT.md) : l'import des données de l'ancien site. Il dit ce que l'import garantit, comment le lancer, à blanc ou pour de vrai, et ce que dit son rapport.
- [`LECTURE-SEULE.md`](docs/migration/LECTURE-SEULE.md) : le gel de l'ancien site par un réglage (`LEGACY_READ_ONLY`), son retrait en une minute et les correctifs prêts à appliquer à l'ancienne API et à l'ancien site.
- [`RETOUR-ARRIERE.md`](docs/migration/RETOUR-ARRIERE.md) : le retour arrière après la bascule sans perdre de comptes. Il dit comment télécharger l'export privé de ce que la v3 a reçu depuis la bascule (`/api/cutover/delta`, admins du site seulement) et quoi rejouer dans l'ancien site.
- [`BASCULE.md`](docs/migration/BASCULE.md) : le pas-à-pas du jour de la bascule. Une liste de feu vert, puis pour chaque étape qui la fait, le geste, le contrôle chiffré, la durée et le critère d'arrêt, et le retour arrière sur une page. Il est gardé par `tests/unit/cutover-steps-doc.test.ts`.

## Travailler dans ce dépôt

Trois documents disent comment travailler ici, à une personne comme à un agent :

- [`CLAUDE.md`](CLAUDE.md) : les commandes, l'architecture, les interdits et les pièges.
- [`AGENTS.md`](AGENTS.md) : à quel rythme lancer les tests, et quand un travail est fini.
- [`docs/qualite.md`](docs/qualite.md) : les règles des tests, les sept règles des listes éditées en place, ce qu'on regarde sur un écran à 390 px, puis la CI, ses garde-fous et le canari, et les règles des mises à jour (Renovate).

Un test les garde : une commande qu'ils citent existe, un lien qu'ils donnent mène quelque part (`bun --no-env-file test tests/unit/guides-agents.test.ts`).

## Ce que contient le squelette

Une application, trois zones, toutes sous `src/app/` :

| Zone | Dossier | Adresse | État |
|---|---|---|---|
| Pages publiques | `(front)/(site)/` | `/`, `/search`, `/profil/<slug>` | Accueil du site en ligne (recherche en tête, talents lus par `src/services/public/talents.ts`, données structurées) ; recherche par ville, en sections par lieu, par mot-clé (seul ou avec une ville) et par pages de 20 ; page publique d'un profil, rendue par le serveur : en-tête (nom en titre, spécialité, zone, disponibilité, photo), description, localisation, réseaux et coordonnées publiées, compétences, langues, formations, portfolio, prestations et prix, expériences |
| Espace maquilleuse | `(front)/(dashboard)/auth/` | `/auth` | Page d'attente |
| Administration | `(payload)/` | `/admin` et `/api` | Générée par Payload : les comptes `admins`, aux rôles `admin` et `editor`, les comptes des maquilleuses, `pros`, leurs profils, `profiles`, les photos, `media`, les talents, `talents`, et les articles du blog, `articles` |

Les noms entre parenthèses rangent les fichiers et n'apparaissent pas dans les adresses.

Les pages publiques et l'espace maquilleuse partagent une seule coquille HTML, `(front)/layout.tsx` : passer de l'une à l'autre se fait sans recharger la page, comme sur le site actuel. L'administration a la sienne, générée par Payload, et ne charge pas la feuille de style du site.

Le reste :

- `src/payload.config.ts` : la configuration de Payload (base PostgreSQL, collections `admins`, `pros`, `profiles`, `media`, `talents`, `articles`, `auth-events`, `contact-requests` et `deleted-accounts`, stockage d'objets des photos).
- `src/lib/payload-language.ts` : Payload parle français, et seulement français : l'enveloppe d'un refus (« Le champ suivant n’est pas valide : Téléphone »), ses refus et ses messages traduits, et l'administration, même quand la requête demande l'anglais ; restent en anglais quelques messages codés en dur dans Payload (« Route not found », `QueryError`, certains `APIError`), que l'espace ne montre jamais. Un refus construit avec les erreurs de Payload leur passe `req.t`, sinon il sort en anglais.
- `src/collections/` : les collections de Payload. `src/lib/access.ts` : qui peut lire, créer, modifier ou supprimer quoi (voir « Accès »).
- `src/services/public/` : la seule lecture publique des données. Une page publique y lit un profil, champ par champ, avec les règles d'accès d'une visiteuse : jamais ce qu'ont écrit l'import ou un admin. Elle donne aussi la liste des profils (listé : ni masqué, ni indisponible, ni entièrement vide ; règle dans `src/lib/profile/visibility.ts`), dit si un profil est indexable (publiable), et ne rend ses coordonnées que si la maquilleuse les publie (`publicContact`). Un test unitaire échoue si une page de `(front)` lit une collection sans passer par ce dossier, ou si une lecture en liste de ce dossier n'a pas de `limit`.
- `scripts/migration/` : les outils de la migration, dont l'import des données de l'ancien site (voir `docs/migration/IMPORT.md`).
- `src/components/profile/` : la page publique d'un profil (tickets 101 à 103). `ProfileView` compose l'en-tête et les cartes à partir d'un `PublicProfile` et rien d'autre ; une carte sans contenu n'est pas rendue, titre compris. Tout est composant serveur, sauf le portfolio (`ProfileGallery`) : une rangée qui défile au doigt (accrochage CSS) et se parcourt au clavier (flèches, début, fin, deux boutons), qui annonce « Photo 2 sur 6 » et ne reçoit que les adresses et les tailles des photos. Ce que la page montre se calcule dans `src/lib/profile/public-view.ts` (listes, dates, liens, coordonnées) et `src/lib/image-size.ts` (la largeur où une photo est demandée). Tests : `tests/unit/public-profile.test.tsx` (les douze profils types), `tests/unit/profile-gallery.test.tsx`, `tests/e2e/public-profile.spec.ts` (E43, E44, E46, E47, E66). Ce que mène l'adresse `/profil/<segment>` (ticket 104) se décide dans `src/lib/profile/url.ts` : le slug d'un profil non masqué donne sa page (200, en `noindex` et sans adresse canonique tant qu'il n'est pas publiable, brouillon compris) ; l'ancien nom d'utilisateur (`legacyUsername`) ou une variante du slug (majuscules, accents, espaces) donne un seul 308 vers le slug ; un slug inconnu, un profil masqué et les 13 profils du spam, que l'import ne reprend pas, donnent la page 404 en français. Cette lecture lève les règles d'accès de la collection (elles ne laissent lire que les profils publiés) : champs choisis un par un, masqué écarté par la règle.
- `src/app/(front)/(site)/blog/` et `src/components/blog/` : la liste du blog (ticket 107), tous les articles publiés du plus récent au plus ancien (jamais un brouillon), lus par `src/services/public/article-list.ts` sous l'étiquette `articles` ; `/toutes-les-news` redirige vers elle. Tests : `tests/unit/blog-list.test.tsx`, `tests/integration/blog-list.test.ts`, `tests/e2e/blog-list.spec.ts` (E64, U62).
- `src/components/layout/` : le gabarit des pages publiques (Nav et menu mobile, pied de page, pages 404 et d'erreur), posé par `(front)/(site)/layout.tsx`. Il ne lit ni cookie ni session : les pages restent statiques. `src/app/global-not-found.tsx` répond la 404 d'une adresse qu'aucune route ne connaît, dans ce même gabarit.
- `src/lib/markdown.ts` : la seule conversion du markdown de la rédaction en HTML (`markdownToHtml`, remark puis `rehype-sanitize`) : le HTML écrit à la main dans le texte est jeté, un script ou un gestionnaire d'événement ne sort jamais, les titres `#` deviennent des `h2` (le titre de la page reste le seul `h1`) et les images se chargent à la demande. Les articles (`/blog/<slug>`, ticket 106, lus par `src/services/public/articles.ts`, composants dans `src/components/content/`) et les talents l'appellent. Un brouillon ou un slug inconnu répond 404 en français. Tests : `tests/unit/markdown.test.ts`, `tests/unit/blog-article.test.ts`, `tests/e2e/blog-article.spec.ts` (E59, E65).
- Page d'un talent (`/talent/<slug>`, ticket 108, lue par `readTalent` dans `src/services/public/talents.ts`) : le titre en haut de la page (`seo_title`, sinon `title`) est le seul `h1`, puis la présentation, le contenu (même `markdownToHtml` que les articles), un lien vers la recherche et le fil d'Ariane en données structurées. L'onglet et les résultats de recherche prennent `pageTitle`, champ de la rédaction de 50 à 60 caractères et différent du `h1` ; vide, ils gardent le titre court suivi du nom du site. Tests : `tests/unit/talent-page.test.ts`, `tests/integration/talents.test.ts`, `tests/e2e/talent.spec.ts` (E59, E65), I45 (`tests/e2e/url-parity.spec.ts`). Sur la copie importée, I45 exige aussi que l'onglet de chaque talent porte le titre écrit par la rédaction (50 à 60 caractères, différent du `h1`) : les 14 titres sont dans `src/content/talent-titles.ts` et l'import les copie dans `pageTitle` quand le talent n'en a pas (jamais par-dessus un titre saisi dans l'administration) ; un talent importé sans titre fait échouer I45.
- Pages fixes pour les particuliers (ticket 109) : `/pourquoi-utiliser-my-makeup-en-tant-que-particulier`, `/solutions/pour-les-particuliers` et les trois guides `/particulier/trouver-une-maquilleuse`, `/particulier/centraliser-ses-recherches`, `/particulier/explorer-les-profils`, plus la page de remerciement `/demande-envoyee` (en `noindex`, sans mesure). Les textes sont dans `src/content/static-pages/client-guides.tsx` et `src/components/static-pages/ClientBenefits.tsx`, mis en page par `ClientGuide` autour des blocs `Hero` et `Cta` de l'accueil : le titre de l'en-tête est le seul `h1`. Tests : `tests/unit/client-pages.test.tsx`, `tests/e2e/client-pages.spec.ts`, I45 (`tests/e2e/url-parity.spec.ts`).
- Pages fixes côté maquilleuses et « À propos » (ticket 110) : `/a-propos`, `/maquilleuse/partenariats`, `/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse` et `/solutions/pour-les-maquilleuses`, sous `src/app/(front)/(site)/`. Les textes du jour du portage sont dans `src/components/static-pages/artist-texts.ts`, posés par `PageArticle` sous l'en-tête et le bloc de fin de l'accueil (`Hero`, `Cta`) ; l'en-tête porte le seul h1. Tests : `tests/unit/artist-pages.test.tsx`, `tests/e2e/artist-pages.spec.ts` (E64, I45).
- `/sitemap.xml` et `/site-map` (tickets 113 et 114) : le sitemap et le plan du site lisent les mêmes pages. Les pages fixes viennent d'une table explicite, `STATIC_PAGES` dans `src/lib/seo/sitemap.ts` (une page « à venir », comme `/contact` jusqu'au ticket 158, n'est ni dans le sitemap ni dans le plan) ; les profils publiables, les talents et les articles publiés viennent de `src/services/public/indexable-pages.ts`, lu par `cachedIndexablePages` sous les étiquettes `profils`, `talents` et `articles`. Le sitemap (`src/app/sitemap.xml/route.ts`) écrit une adresse absolue par page, sans `//`, avec la date réelle de dernière modification et sans `changefreq` ni `priority` ; une base en erreur donne un 500, jamais un sitemap raccourci. Le plan du site (`src/app/(front)/(site)/site-map/page.tsx`) a un seul `h1`, et lie les profils publiables par leur nom. Un test (`tests/unit/sitemap.test.ts`) échoue si une page de l'application n'est ni dans la table ni dans les exclusions (`EXCLUDED_PAGES`, `EXCLUDED_PREFIXES`), ou si une page de la table n'existe pas. Tests : `tests/unit/sitemap.test.ts` (U38 à U43), `tests/e2e/sitemap.spec.ts` (E62), I45.
- `src/lib/search/` : ce que la page de recherche lit de l'adresse (`input.ts`, dont `page` et `specialite`, lu comme `search` quand `search` est vide), le classement par mot-clé (`relevance.ts`, porté de l'ancienne API : accents ignorés, une faute pour cinq lettres, tous les mots requis, mots vides et mots de la demande ignorés, poids normalisés), son assemblage avec la ville (`results.ts`), les pages de 20 (`pagination.ts`), la lecture bornée à 8 secondes (`read.ts` : un message et « Réessayer » plutôt qu'un écran blanc) et le frein (`rate-limit.ts`). Le texte tapé n'est ni journalisé, ni mesuré, ni dans une clé de cache : la recherche se fait en mémoire sur l'annuaire en cache (`cachedDirectoryWithTexts`). La mise en sections par lieu est dans `place.ts` (la ville, puis le département tapé, puis le même département, ceux qui se déplacent, le reste) ; un code postal tapé classe d'abord les profils dont la commune le porte (`postalCodes`, un code partagé trouve toutes ses communes), et la phrase des communes sous le titre vient des profils trouvés, sans appel au référentiel (ticket 263). Un profil de pays a pour place son libellé sans drapeau (`directoryPlace`, `src/services/public/profiles.ts`), n'a ni département ni code postal, et se déplace s'il a plusieurs pays ou un rayon. Le drapeau n'est rendu que par `src/components/profile/ZoneText.tsx` (`aria-hidden`), jamais dans un titre, une description, une donnée structurée ni la place cherchée (ticket 264). `src/services/public/cached.ts` : les lectures publiques gardées dans le cache de Next, sous l'étiquette de la liste qu'elles lisent (`talents`, `profils`). `src/lib/urls/shape.ts` : la forme d'une adresse (barre finale, `//`, `/toutes-les-news`), répondue par `src/proxy.ts` en un seul saut ; Next ne répond plus lui-même à la barre finale (`skipTrailingSlashRedirect`).
- `src/lib/seo/` et `src/proxy.ts` : le socle SEO. Titre (60 caractères au plus), description (70 à 155), adresse canonique absolue sur `https://my-makeup.fr` sans barre finale, et consigne robots. `src/proxy.ts` pose `X-Robots-Tag` à chaque requête : `noindex` sur `/auth` et `/search`, qui ne sont pas bloquées dans `robots.txt`. Il n'y a plus de `noindex` sur tout un site selon `APP_ENV` : le `noindex` d'un hôte temporaire vient de l'hôte lui-même (réglage de l'hébergeur), pas du code. Une page `noindex` n'a pas d'adresse canonique. Jamais `noarchive`, `nocache`, `nosnippet` ni `max-snippet` : les assistants citent le site. `/robots.txt` vient d'une seule source, `src/app/robots.ts` (règles dans `src/lib/seo/robots.ts`) : tout est ouvert sauf `/api/`, avec l'adresse absolue du sitemap ; pas de fichier `public/robots.txt`.
- Une adresse inconnue de profil, de talent ou d'article (ticket 231) : `notFound()` dans une page n'envoie au navigateur qu'une coquille vide (`<html id="__next_error__">`) et le flux de la page, sans le `h1` de la 404 dans le HTML du serveur. Pour une adresse à un seul segment sous `/profil`, `/talent` ou `/blog` (GET ou HEAD), `src/proxy.ts` demande donc d'abord à `src/services/public/exists.ts` si la page existe, avec les mêmes lectures que la page ; le cache de Next ne garde rien quand il est lu depuis le proxy, donc le processus retient une minute les pages qui existent (jamais une adresse inconnue, `existingPagesMemory`) : une page qui existe n'ajoute aucune lecture de la base à ses visites suivantes ; si elle n'existe pas, il la réécrit vers la page 404 du site, rendue en entier, avec son `h1`, son titre, son statut 404 et `noindex`. Un profil dont l'adresse mène à une redirection (ancien nom, variante) passe jusqu'à la page. Une lecture qui échoue (base muette) laisse la page répondre. Les pages gardent leur `notFound()` pour ce que le proxy ne pouvait pas savoir. Règle des adresses vérifiées : `src/lib/urls/unknown-page.ts`. Tests : `tests/unit/unknown-page.test.ts`, `tests/unit/proxy-unknown-page.test.ts`, `tests/e2e/page-404-h1.spec.ts`.
- `src/lib/seo/profile.ts` : l'en-tête de la page d'un profil (ticket 105) : titre « Nom – spécialité à ville | My-Makeup » (60 caractères au plus), description, canonique ou `noindex` selon qu'il est publiable, et les données structurées (`ProfilePage` → `Person`, offres en euros, fil d'Ariane), sans coordonnée, adresse postale ni note. Tests : `tests/unit/profile-seo.test.ts` (U47 à U50), `tests/e2e/profile-seo.spec.ts` (E64, E65).
- `src/lib/seo/share.ts` : l'aperçu d'un lien partagé (ticket 116). `pageMetadata()` en tire, pour toute page, `og:title`, `og:description`, `og:url`, `og:type` (`profile` pour un profil, `article` pour un article, `website` ailleurs), `og:image` absolue, et la carte Twitter. Une page en `noindex` les garde, sans adresse canonique. L'image est celle du site (`/assets/og-my-makeup.jpg`, 1 200 × 630) ; pour un profil, c'est sa photo principale passée par l'optimiseur d'images de Next (`/_next/image?url=…&w=1200&q=75`), jamais agrandie, de 300 Ko au plus. Tests : `tests/unit/share-open-graph.test.ts` (U51), `tests/e2e/share-open-graph.spec.ts` (E64 sur 12 adresses, poids et largeur de l'image).
- Description de la maquilleuse (ticket 122) : `DescriptionEditor` ouvre le même panneau que l'identité (`EditingPanel`) et enregistre par l'action `saveMyDescription` (`src/lib/dashboard/save-description.ts`). `src/lib/dashboard/description.ts` est la seule règle, lue par le formulaire et par le serveur : 2 000 caractères au plus (U27), tout HTML retiré (balises, scripts, styles, commentaires), sauts de ligne gardés, clé autre que `description` refusée (U32). Le compteur sous le champ compte par `descriptionLength` de la complétude (200 caractères pour être publiable, U05). Tests : `tests/unit/dashboard-description.test.ts`, `tests/unit/dashboard-description-panel.test.tsx`, `tests/integration/dashboard-description.test.ts`, `tests/e2e/dashboard-description.spec.ts` (E19-E29 description, E31, U05, U27).
- `src/app/u/` : la mesure d'audience servie par le site (`/u/script.js`, `/u/api/send`), relayée vers Umami sans cookie ni Referer ; tout autre chemin sous `/u` répond 404. `src/lib/analytics/` : le catalogue fermé des événements (`events.ts`), `track()`, seul chemin d'une page vers Umami, et le relais. Voir [`docs/mesure/umami.md`](docs/mesure/umami.md).
- `src/lib/providers.ts` : la liste des prestataires de la politique de confidentialité (ticket 189), seule source de la page `/politique-de-confidentialite`. `tests/unit/providers-policy.test.tsx` la compare aux services configurés (hébergeur, instance Umami, stockage S3, relais SMTP, Google) : changer de service sans éditer la liste fait échouer la CI. La page donne aussi les délais que le code applique (7 jours pour un compte jamais confirmé, 30 jours avant l'effacement d'une photo retirée).
- Événements de l'inscription et de la connexion (ticket 146) : `signup_start` (premier envoi du formulaire, ou clic sur le bouton Google de l'inscription), `login_result` (refus par email dans le formulaire ; réussite, email ou Google, sur la première page d'arrivée, d'après un cookie `mm-sign-in-mark` de deux minutes qui ne contient que « email » ou « google » et que la page dépense, voir `src/lib/analytics/sign-in-mark.ts` ; échec de Google sur la page de connexion avec le code affiché), `auth_error` (refus d'inscription, retour de Google en échec) et `session_expired` (une fois, à l'arrivée sur la connexion avec `?error=session-expiree`, `where` = `jwt_expire`). Aucun email, nom ni jeton dans les propriétés. Test : `tests/unit/analytics-auth.test.tsx`.
- Événements de l'espace maquilleuse (ticket 147, `src/lib/dashboard/analytics.ts`) : `profile_save` (une fois par réponse du serveur à un enregistrement de section, avec son résultat `ok` ; les verrous des panneaux font qu'une touche Entrée maintenue n'en donne qu'un), `profile_publiable` (sans propriété, seulement quand le serveur dit que cet enregistrement a fait passer le profil à publiable : `withPublishableTransition` dans `src/lib/dashboard/publishable-transition.ts` compare l'état avant et après, donc jamais dans l'autre sens ni pour un profil qui l'était déjà), `upload_error` (`size`, `type` ou `server`, la vraie cause du refus d'une photo, avant l'envoi ou par le serveur ; une session finie n'est pas un refus), `profile_visibility` (au clic sur « Voir mon profil public » ou « Modifier mon profil », `ViewLink`, jamais au chargement) et `account_delete` (seulement une fois le compte supprimé). Aucune propriété ne porte un texte saisi : le catalogue (`src/lib/analytics/events.ts`) n'accepte que des mots de listes fermées. Tests : `tests/unit/analytics-dashboard.test.tsx` (U82).
- Événements de l'onboarding (ticket 148) : `onboarding_step` (`identite`, `zone`, `photo`, `termine`, une fois par visite, une fois le serveur ayant répondu) et `onboarding_source` (l'origine déclarée, une fois, seulement si choisie), émis par `Accueil`. La réponse ne va ni au serveur ni à la base. Test : `tests/unit/analytics-onboarding.test.tsx`.
- `src/lib/seo/indexnow.ts`, `src/app/api/indexnow/[key]/route.ts` et `scripts/seo/indexnow-all.ts` : IndexNow (ticket 219), le fichier de clé servi à la racine par une réécriture de `next.config.ts`, l'envoi des adresses qui changent depuis `src/collections/revalidate.ts`, et `bun run indexnow:all` pour tout le sitemap (voir [`docs/seo/indexnow.md`](docs/seo/indexnow.md)). Tests : `tests/unit/indexnow.test.ts`.
- `src/app/api/stats/weekly/route.ts` : les statistiques du rapport du lundi, des agrégats seulement, derrière le jeton `STATS_TOKEN` (voir [`docs/mesure/statistiques-hebdomadaires.md`](docs/mesure/statistiques-hebdomadaires.md)).
- Formulaire de contact (tickets 158 à 160) : la page `/contact` (`src/app/(front)/(site)/contact/`) garde les cinq champs du site en ligne, tous requis. L'action serveur vérifie le message (`src/lib/contact/message.ts`, les phrases et les limites du site en ligne), l'écrit dans la collection `contact-requests` (type `contact`, statut `new`, email `pending`), répond, puis envoie le mail à l'équipe après la réponse (`src/lib/contact/payload-send.ts`) par la porte d'envoi unique, avec l'adresse saisie en `Reply-To`. Le mail a un délai de 8 secondes : au-delà, ou si le fournisseur échoue, la ligne passe en `echec` et la visiteuse voit quand même la confirmation ; si l'enregistrement échoue, rien ne part et elle voit l'erreur, sa saisie gardée. Un message invalide ne crée aucune ligne. Seul un admin lit `contact-requests` ; aucune API ne la crée ni ne la supprime (l'écriture est celle du serveur, comme le journal d'authentification), et un admin n'en change que le statut (ticket 163). Aucun journal ne garde un champ saisi. Le formulaire envoie une seule fois (double clic, Entrée maintenue), annonce ses erreurs sous les champs et envoie `platform_contact_submit` une fois par réponse (`ok` : message enregistré). Tests : `tests/unit/contact-message.test.ts`, `tests/unit/contact-send.test.ts`, `tests/unit/contact-form.test.tsx`, `tests/integration/contact.test.ts`, `tests/e2e/contact.spec.ts` (I32, I33, E50, E51, E69, U76 adaptés). Ticket 161 : un champ piège (`commentaire`, hors de vue, hors du clavier, caché aux lecteurs d'écran) rempli fait répondre la confirmation habituelle sans rien écrire ni envoyer. Le serveur limite à 5 messages par heure et par adresse cliente (`ipClient`) et à 20 par jour et par boîte (forme canonique hachée, `src/lib/contact/rate-limit.ts`) ; seuls les messages qui passent la validation comptent. Passé les 5 de l’heure par adresse ou les 20 du jour par boîte, `src/proxy.ts` réécrit le POST vers `/contact/throttled`, qui répond un vrai 429 en français avec `Retry-After` ; le formulaire garde la saisie et dit la phrase. Pour la boîte, le proxy lit une copie du corps (champ `email`, avec ou sans le préfixe de React, 64 Ko au plus) sans rien prendre ; l’action reste la vérification qui compte les places, et elle refuse aussi avec la même phrase si le proxy n’a rien vu. Une requête sans `X-Forwarded-For` ou venue d’une adresse locale n’est jamais comptée par adresse (développement, banc), comme la recherche : cela suppose que l’application n’est joignable que par Traefik, et la limite par boîte reste seule à l’arrêter sinon ; les compteurs sont en mémoire du processus. Tests : `tests/unit/contact-rate-limit.test.ts` (U77), `tests/integration/contact.test.ts` (I34), `tests/e2e/contact.spec.ts`. La purge à 12 mois est le ticket 162 ; messages dans l'administration (ticket 163) : un admin lit `contact-requests`, marque un message `answered` ou `spam` (cycle `new` → `forwarded` → `answered`, tenu par la collection ; les autres champs sont figés, la date de réception comprise), voit au-dessus de la liste le nombre d'emails en échec avec le lien du filtre `mailStatus = failed`, et renvoie l'email d'un message en échec par le bouton « Renvoyer l'email » de sa fiche (`POST /api/contact-requests/:id/resend`, `src/lib/contact/resend.ts`) : le clic prend le message avant d'envoyer, donc un double clic n'envoie qu'un mail. La rédaction ne voit pas la collection. Tests : `tests/unit/contact-statuses.test.ts` (U78), `tests/unit/contact-resend.test.ts`, `tests/integration/contact-admin.test.ts`, `tests/e2e/admin-messages-contact.spec.ts` (E53, E55, E58). Ticket 224 : sans relais d'envoi (`SMTP_HOST` absent : un poste de développement, jamais le site), la porte d'envoi rend `NO_RELAY` au lieu de se taire, et la ligne reste `echec` au lieu de passer à `transmise` ; l'admin la renvoie une fois le relais posé. Un message resté `en-attente` plus de 15 minutes (le processus s'est arrêté entre l'enregistrement et l'envoi) passe à `echec` par la tâche quotidienne `reprise-messages-contact-bloques` (`src/lib/tasks/stuck-messages.ts`, âge compté depuis la dernière écriture de la ligne) et devient renvoyable. Tests : `tests/unit/contact-send.test.ts`, `tests/unit/purge-messages-contact.test.ts`, `tests/integration/contact-retry.test.ts` (horloge simulée).
- `src/lib/env.ts` : les variables d'environnement, vérifiées au démarrage par `src/instrumentation.ts`.
- `src/migrations/` : les migrations versionnées de la base.
- `src/lib/auth/` : la connexion des maquilleuses. `sign-in.ts` (email et mot de passe, un code d'erreur et jamais le compte), `legacy.ts`, `legacy-hash-payload.ts` et `equal-time-payload.ts` (le mot de passe d'un compte de l'ancien site et le temps égalisé des refus, voir « Connexion et frein »), `rate-limit.ts` et `client-ip.ts` (le frein par adresse cliente, voir « Connexion et frein »), `return-to.ts` (la page de retour, interne seulement), `session.ts` (la garde des pages privées), `session-state.ts` (session valable, anonyme, expirée ou invérifiable : une panne ne déconnecte personne, et un jeton arrivé à sa fin renvoie une seule fois à la connexion avec « Ta session a expiré, reconnecte-toi. »), `session-duration.ts` (les règles pures), `sliding-session.ts` (les hooks Payload) et `extend.ts` (la durée de la session, voir « Connexion et frein »), `closed-dashboard.ts` et `src/proxy.ts` (la porte rapide : sans cookie, ou avec un cookie expiré), `legacy-cookies.ts` (les cookies de l'ancienne authentification, expirés 90 jours après la bascule, voir `CUTOVER_DATE`), `forgot-password.ts` (les règles pures du mot de passe oublié : adresse, nouveau mot de passe, jeton de 40 caractères, plan du lien pour `src/proxy.ts`, textes), `password-reset-payload.ts` (la demande, qui répond pareil et dans le même temps pour toute adresse et laisse partir le mail après la réponse, puis le choix du nouveau mot de passe, qui ferme toutes les sessions, voir « Mot de passe oublié ») et `forgot-payload.ts` (les portes REST natives de Payload fermées).
- Session expirée pendant l'édition (ticket 121) : l'enregistrement d'un panneau de l'espace échoue proprement (le proxy ne redirige jamais un `POST`, c'est l'action qui répond « session expirée »), `src/lib/dashboard/guarded-input.ts` garde la saisie dans le `sessionStorage` de l'onglet (une clé par section et par compte, un jour au plus), le formulaire renvoie une seule fois vers `/auth/signin` avec le message, et au retour le même panneau se rouvre avec la saisie ; elle disparaît après un enregistrement réussi ou un abandon. Une deuxième expiration dans les 10 minutes qui suivent le renvoi ne renvoie pas : le message reste dans le panneau, avec un lien vers la connexion dans un nouvel onglet (de même sans stockage). Tests : `tests/unit/guarded-input.test.ts`, `tests/unit/dashboard-panel.test.tsx`, `tests/unit/expired-session.test.ts`, `tests/e2e/dashboard-profile.spec.ts` (E32).
- Disponibilité de la maquilleuse (ticket 124) : un interrupteur sur la carte « Disponibilité » de `/auth/profil` (`AvailabilitySwitch`), enregistré par `saveMyAvailability` (`src/lib/dashboard/save-availability.ts`, schéma strict d'un seul booléen dans `src/lib/dashboard/availability.ts`). L'interrupteur ne change qu'après la réponse du serveur ; un échec le laisse sur l'état enregistré et le dit ; touche maintenue ou double clic : une seule bascule. Indisponible, le profil sort de la liste et de la recherche (`LISTED_FILTER`) et la carte le dit ; une valeur absente (profil importé) se lit « Disponible ». Tests : `tests/unit/dashboard-availability.test.tsx`, `tests/integration/dashboard-availability.test.ts`, `tests/e2e/dashboard-availability.spec.ts` (E19-E29).
- Suppression du compte (ticket 141) : « Supprimer mon compte » en bas de `/auth/profil` (`AccountDeletion`) ouvre une fenêtre qui demande le mot de passe, ou l'adresse email pour un compte venu de Google ou de Facebook (`src/lib/dashboard/deletion-confirmation.ts`, la part commune au navigateur et au serveur). L'action serveur (`deletion-actions.ts`) lit la session, vérifie l'origine, puis `deleteMyAccount` (`src/lib/dashboard/delete-account.ts`) freine les mauvaises saisies (10 par 15 minutes, par adresse et par compte) et appelle la cascade commune, `deleteAccountAndDependents` (`src/lib/account/deletion.ts`, reprise par l'admin au ticket 167) : le profil, puis le compte et ses sessions, dans une seule transaction et sous une seule retenue de la corbeille. Panne du stockage : rien n'est supprimé. L'API garde `delete` fermé à la maquilleuse. L'admin supprime un compte depuis sa fiche dans l'administration (menu ⋮, « Supprimer », avec confirmation) : `DELETE /api/pros/:id` (`src/lib/account/deletion-route.ts`, ticket 167, réservé au rôle `admin`) appelle la même cascade, et les photos d'un compte sans profil partent aussi à la corbeille ; la suppression de plusieurs comptes à la fois est fermée, et l'API locale refuse toujours un compte qui a encore un profil. Tests : `tests/integration/admin-account-deletion.test.ts` (I37), `tests/e2e/admin-account-deletion.spec.ts` (E57). Tests : `tests/unit/dashboard-deletion.test.tsx`, `tests/integration/dashboard-deletion.test.ts` (I36, I38), `tests/e2e/dashboard-deletion.spec.ts` (E33).
- `src/payload-types.ts` et `src/app/(payload)/admin/importMap.js` : fichiers générés par Payload, versionnés, jamais modifiés à la main.
- `docker-compose.yml` : la base PostgreSQL de développement.
- `Dockerfile` et `.dockerignore` : l'image de production (voir « Image Docker »).
- `.github/workflows/ci.yml` et `ci/required-checks.json` : la CI et les checks requis (voir « Intégration continue »).
- `renovate.json` : les règles des mises à jour des dépendances, sans effet avant la bascule (voir « Mises à jour des dépendances »).
- `.env.exemple` : la liste des variables d'environnement, sans aucune valeur.
- `tests/` : les tests. Un composant React s'y teste seul, sans navigateur : voir `docs/tests/composants.md`. Un service extérieur s'y simule, et aucun test n'appelle Internet : voir `docs/tests/http-sortant.md`.
- `compose.test.yml` et `.env.test` : le banc de test local et son environnement factice, voir « Le banc de test ».
- `src/demo-data/` : le jeu fictif du banc de test, qui ne se charge nulle part ailleurs : les 12 profils types, leurs maquilleuses fictives et leurs photos, trois talents et trois articles dont un brouillon, voir « Le banc de test ».
- `playwright.config.ts` : les essais de bout en bout, voir « Les essais de bout en bout ». Il ne règle rien lui-même : tout vient de `tests/support/e2e.ts`.
- `src/content/changelog.json` : les notes de version, en attente puis publiées ; `.github/workflows/release.yml` : la publication d'une version, qui écrit `.release/version.json` (voir « Notes de version et publication »).

Les versions sont figées dans `package.json`, et `bun.lock` est le seul fichier de verrouillage.

### Complétude d'un profil

Une seule règle dit où en est un profil : `src/lib/profile/completeness.ts`. Elle est portée de l'ancien site sans changement. Le schéma, l'espace maquilleuse, la recherche et le sitemap passent tous par elle, sans refaire le calcul de leur côté.

Elle donne :

- le score sur 13 et la liste des manques, pour la barre de progression ;
- les six conditions du profil publiable : photo principale, ville exploitable, spécialité, offre avec un prix chiffré, description d'au moins 200 caractères, canal de contact ;
- `active` : photo principale, ville exploitable et spécialité ;
- `publishable` : les six conditions, sauf pour un compte interne, qui ne l'est jamais ;
- `fullyEmpty` : aucune des six conditions. Un profil qui n'a qu'un nom est entièrement vide ; une seule condition remplie suffit à ne plus l'être.

Le formulaire de devis ne compte pas comme canal de contact.

La règle lit les champs sous leurs noms de l'ancien site (type `ProfileFields`) : le code qui l'appelle fait la correspondance depuis son propre document. Une photo se passe comme un objet ou une liste, jamais comme un simple identifiant, qui compterait comme « pas de photo ».

Les tests sont dans `tests/unit/completeness.test.ts` et se lancent seuls avec `bun --no-env-file test tests/unit/completeness.test.ts`. Deux fichiers de `tests/unit/fixtures/` servent de référence :

- `completeness-cases.json` : les cas partagés avec l'ancien site, copiés tels quels ;
- `completeness-old-site.json` : les réponses du code de l'ancien site sur ces cas et sur ceux de son API. Ces valeurs ne se corrigent jamais à la main : un écart est un défaut du port.

### Listes d'un profil

Un profil porte cinq listes : les prestations (`serviceOffers`, chacune avec ses `options`), les compétences (`skills`), les langues (`languages`), les formations (`courses`) et les expériences (`experiences`). Les champs sont dans `src/collections/profile-lists.ts`, leurs noms dans [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md), §6. Les règles sont dans `src/lib/profile/lists.ts`, que les formulaires de l'espace maquilleuse appelleront aussi.

- **L'ordre est celui de l'envoi.** Une liste s'envoie entière, dans l'ordre voulu. Une sauvegarde qui n'envoie pas une liste la laisse telle quelle.
- **Le serveur donne l'identifiant de chaque ligne, et le garde.** Une ligne renvoyée avec son identifiant le garde d'une sauvegarde à l'autre, et retirer une ligne ne change l'identifiant d'aucune autre. Toute autre ligne est une ligne nouvelle, qui reçoit un identifiant neuf : une ligne sans identifiant, une ligne venue avec un identifiant que le serveur n'a pas donné à cette liste (tiré de son contenu, ou pris à un autre profil), la seconde copie d'une même ligne. Après une sauvegarde, les identifiants se relisent dans la réponse.
- **Les bornes**, refusées avec un message en français, sans rien écrire : 70 caractères pour un nom, un prix saisi, un diplôme, une école, une entreprise, un poste ou une ville ; 2 000 pour une description ; un montant de 5 à 10 000 €, la règle de `src/lib/price.ts`, ou rien pour un prix « sur devis » ; la fin d'une expérience pas avant son début ; une formation obtenue au plus un an après la date du jour.
- **Une date est un jour**, rangé à 12:00 UTC : le même jour dans tous les fuseaux de la France. Un texte « AAAA-MM-JJ » donne ce jour, et un texte vide ne donne aucune date.
- Aucun champ d'une ligne n'est obligatoire pour le serveur : une ligne reprise de l'ancien site garde ses valeurs vides. Les formulaires de l'espace disent ce qu'ils exigent.

Les tests : `tests/unit/profile-lists.test.ts` pour les règles, `tests/integration/profile-lists.test.ts` pour la collection, sur le banc de test. Une date de l'an 0 (« 0000-01-01 »), que PostgreSQL n'a pas, n'est pas une date : refus en 400 comme « 2024-02-30 », jamais un 500 (ticket 224).

### Zone d'un profil

La zone d'un profil est une commune de la liste officielle, un rayon d'action et « à domicile », partout en France. Elle n'a aucun champ pour une adresse postale. Les règles et leurs messages en français sont dans `src/lib/profile/zone.ts`, les champs dans `src/collections/profiles/zone.ts` :

- `city` : son nom et son code INSEE, jamais l'un sans l'autre, et les coordonnées de son centre si on les connaît. Elle s'envoie entière : ce qu'une requête n'en donne pas est vidé, jamais repris de la commune déjà enregistrée. Le serveur refuse une commune sans code INSEE, un code mal formé, une ville tapée en texte libre sans code, une commune envoyée en liste, un nom qui ressemble à une adresse (un numéro, un code postal, une virgule, « rue des Lilas »), et un nom fait d'autres caractères que des lettres, des espaces, des traits d'union, des apostrophes et des parenthèses (un email, un site, « St. »). Aucun nom de la liste officielle n'est refusé par la règle des adresses : elle a été jouée sur toute la liste du 14/10/2026. Les coordonnées sont gardées à deux décimales : le centre de la commune à environ 1 km près, jamais un point qui situe un domicile. Le code peut être celui d'un des 101 départements ou d'une des collectivités d'outre-mer de la liste officielle (975, 977, 978, 984, 986 à 989). Le serveur calcule lui-même le département depuis le code (« 74010 » donne « 74 », « 2A004 » donne « 2A », « 97701 » donne « 977 ») : une valeur envoyée pour lui est remplacée. `null` vide la commune.
- `radiusKm` : de 0 à 200 km, en kilomètres entiers, ou vide. L'affichage garde sa propre borne de 1 000 km (`src/lib/format-zone.ts`), pour les valeurs de l'ancien site.
- `homeService` : vide tant que la maquilleuse ne l'a pas dit.

La zone suit la lecture de son profil, sans règle d'accès propre : qui lit un profil lit toute sa zone, code INSEE et coordonnées du centre de la commune compris, qui sont des données publiques de référence. Le public la lit donc avec les profils publiés. Que la commune existe vraiment dans la liste officielle, et que son nom soit celui de son code, le serveur ne le vérifie pas : il ne vérifie que la forme du nom. Un nom bien formé à côté d'un code bien formé est donc accepté, même s'il n'est pas celui de ce code. L'espace maquilleuse et l'import choisiront la commune dans cette liste, nom et code ensemble (tickets 123 et 063). Tests : `tests/unit/profile-zone.test.ts`, et sur le banc `tests/integration/profile-zone.test.ts`.

**Choisir sa commune dans l'espace** (ticket 123). La carte « Localisation » de `/auth/profil` ouvre un panneau : une commune à choisir dans la liste officielle, un rayon de 0 à 200 km (vide permis) et « à domicile ». La commune se cherche par son nom ou son code postal ; un texte qui ressemble à une adresse n'est jamais envoyé à la liste, et le panneau le dit.

- **Le navigateur ne parle jamais à `geo.api.gouv.fr`** (la politique de sécurité ne laisse parler qu'au site lui-même). La recherche et l'enregistrement sont deux Server Actions (`src/app/(front)/(dashboard)/auth/profil/location-actions.ts`) : session relue, origine vérifiée, une maquilleuse connectée seulement, 120 recherches par minute et par compte. Le client de la liste est `src/lib/dashboard/city-reference.ts`, appelé par `fetch` (donc simulable, voir `docs/tests/http-sortant.md`), avec son propre délai de 5 s.
- **L'enregistrement ne reçoit qu'un code INSEE**, un rayon et « à domicile » (`strictLocationSchema`, `src/lib/dashboard/location.ts`) : un nom, des coordonnées, un département ou un champ réservé refusent la requête entière. Le serveur demande la commune de ce code à la liste, et enregistre son nom et son centre à elle : un nom ne peut pas se retrouver à côté du code d'une autre commune. Un texte libre n'est pas un code : refusé ici, et par la collection derrière.
- **Liste en panne** (réponse autre que 200 ou 404, réseau coupé, corps inattendu, plus de 5 s) : un seul message en français, rien n'est écrit, l'ancienne commune reste. La liste n'est interrogée que si le code change : le rayon et « à domicile » s'enregistrent même quand elle ne répond pas. Un code que la liste ne connaît pas (404) est refusé sous le champ de la commune.
- **Le champ de la commune** (`src/components/dashboard/CityField.tsx`) est un « combobox » ARIA : flèches, Entrée pour choisir (sans envoyer le formulaire), Échap pour fermer la liste seulement ; chaque suggestion est un bouton de 44 px au moins, qui ne prend pas le focus du champ. Retaper après un choix reprend la commune. Les réponses qui arrivent dans le désordre sont jetées.
- Tests : `tests/unit/dashboard-location.test.ts` (U14, U15, U16, les règles), `tests/unit/dashboard-city-reference.test.ts` (la liste simulée : 200, 404, 500, réseau coupé, corps inattendu, service muet), `tests/unit/dashboard-location-panel.test.tsx` (clavier, doigt, texte libre, panne), et sur le banc `tests/integration/dashboard-location.test.ts`. Pas d'essai de bout en bout : l'application du banc appellerait la vraie liste, qu'aucun test ne simule hors de son processus.

**Code postal, zone à revoir et étranger dans l'espace** (tickets 265 et 266, `PLAN-ZONES.md` §3.3 et §3.4). La section « Ta zone » de `/auth/profil` et l'étape 2 de l'accueil emploient le même composant (`src/components/dashboard/ZoneFields.tsx`) : la question « Où travailles-tu ? », un champ unique et le lien « Je travaille à l'étranger ou dans plusieurs pays ».

- **Un code postal** (`findCities` demande aussi `codesPostaux`) : cinq chiffres qui ne donnent qu'une commune la choisissent sans clic et l'annoncent dans `role="status"` ; un code partagé ouvre la liste (« Annequin (62) · 62149 ») sans rien choisir seul. La liste en panne garde le message d'avant et la commune enregistrée.
- **Les codes postaux enregistrés** sont ceux du référentiel pour le code INSEE (`cityFromCode`), jamais ceux d'une requête : le schéma strict refuse un champ `postalCodes`. Une commune enregistrée sans codes postaux les reprend à l'enregistrement suivant.
- **Une zone à revoir** (`zoneReview`, ticket 259) : un bandeau (`ZoneReviewBanner`, visible de la seule propriétaire) propose les communes du code postal partagé en boutons ; un appui enregistre et le serveur vide la revue. Sans code postal, il dit que la zone n'a pas pu être reprise et demande une commune ou un pays. Aucun texte de l'ancien site n'est affiché.
- **L'étranger** : `strictLocationSchema` est l'une des deux formes, `{ kind: 'city', codeInsee, … }` (sans `kind`, une commune) ou `{ kind: 'countries', countries, town, … }`. Une requête qui mêle `codeInsee` et `countries`, ou qui porte un champ réservé, est refusée entière. Le champ propose aussi les pays de la liste embarquée (filtre dans le navigateur, sans requête) ; les pays se choisissent en puces, 5 au plus, avec « Ville (facultatif) » quand un seul pays étranger est choisi, et chaque puce se retire par « Retirer Belgique ». La carte montre `formatZone`. `saveLocation` écrit l'une ou l'autre forme, et le profil devient publiable comme avec une commune.
- Tests : `tests/unit/dashboard-city-reference.test.ts`, `dashboard-location.test.ts`, `dashboard-zone-choice.test.ts`, `dashboard-location-panel.test.tsx`, `dashboard-onboarding-panel.test.tsx`, sur le banc `tests/integration/dashboard-location.test.ts`, et de bout en bout `tests/e2e/dashboard-zone.spec.ts` et `tests/e2e/dashboard-onboarding.spec.ts` (la fausse liste des communes du banc, aucune requête ne sort du poste).

### État d'un profil

À chaque enregistrement d'un profil, quel qu'en soit l'auteur (la maquilleuse, un admin, l'import), le serveur calcule où il en est par la règle unique de la complétude, puis l'enregistre avec lui. Les règles sont dans `src/lib/profile/state.ts`, les champs dans `src/collections/profiles/state.ts` :

- `completeness` : le score sur 13 ; `active`, `publishable` et `fullyEmpty` : les drapeaux de la règle ;
- `activeSince`, `publishableSince` et `fullyEmptySince` : pour chaque drapeau, la date à laquelle il a pris sa valeur. Elle ne bouge pas tant que le drapeau garde la sienne.

La règle lit le profil comme la v3 le tient : la ville est le nom de la commune, qui a toujours son code INSEE (un nom que la règle trouve trop long, comme « Pont de Montvert - Sud Mont Lozère », seul cas de la liste officielle, est relu avec ses traits d'union collés) ; une photo compte par son seul identifiant ; le prix chiffré d'une offre est son montant (`priceFrom`), qu'un texte sans montant (« Sur devis ») n'a pas ; le téléphone et l'email de contact ne comptent que si la maquilleuse les montre (`publicContact`).

Aucune API n'écrit ces champs : ce qu'une requête envoie dessus est ignoré, et le serveur les recalcule. Le score et les trois drapeaux sont lus par tous ceux qui lisent le profil : ils ne disent rien qu'on ne voie déjà, et les pages publiques en ont besoin (noindex, sitemap, recherche). Les dates ne sont lues que par la propriétaire et un admin.

Le statut (`status`) est calculé lui aussi : aucune API ne l'écrit, pas même un admin. Il suit le choix de l'admin (`chosenStatus`, écrit par un admin seulement, lu aussi par la propriétaire) :

- `automatic`, le choix d'un profil neuf : un profil entièrement vide est en brouillon, et passe à publié dès qu'il remplit une des six conditions ; il repasse en brouillon s'il les perd toutes ;
- `draft`, `published` ou `hidden` : le statut reste celui-là, quoi qu'on enregistre. Un profil masqué ne redevient visible que par un admin. L'admin rend le statut à la règle en choisissant `automatic` ; la règle s'applique dès cet enregistrement.

Seul un choix différent de celui qui est enregistré change le choix. Le formulaire de l'administration renvoie tous ses champs : chargé avant un enregistrement de la maquilleuse, il renvoie l'ancien statut, ignoré, et le choix qu'il a lu, inchangé ; il ne fixe donc rien. Le code serveur qui écrit `status` lui-même, règles d'accès levées (l'import, un jeu d'essai, un test), en fait le choix de l'admin.

Tests : `tests/unit/profile-state.test.ts`, et sur le banc `tests/integration/profile-completeness.test.ts`, qui écrit chaque cas partagé de la complétude comme l'import l'écrira (`tests/support/completeness-cases.ts`) et compare l'état enregistré à la règle et aux réponses de l'ancien site.

### La liste des profils dans l'administration

La liste de `profiles` montre, dans l'ordre : l'adresse, la commune, la complétude, « publiable », le statut et la dernière modification, la plus récente d'abord (`defaultSort: '-updatedAt'`). La dernière activité d'un profil est son dernier enregistrement (`updatedAt`) : `derniereActivite` est prévue sur le compte, pas sur le profil (`docs/migration/SCHEMA.md`, §9). La recherche du panneau lit l'adresse, le prénom, le nom, le nom d'artiste et la commune. Les filtres du panneau (publiable, entièrement vide, statut, statut choisi) lisent les drapeaux stockés à chaque enregistrement : ils ne calculent rien.

Une valeur qui n'est pas un choix est refusée avec une phrase, jamais ignorée ni répondue par une erreur de la base : un admin qui envoie un `chosenStatus` inconnu reçoit un 400 « Ce statut n'existe pas », et un filtre sur un statut inconnu (`where[status][equals]=archive`) un 400 « Ce filtre nomme un statut qui n'existe pas ». Ce que la maquilleuse envoie sur ces champs reste ignoré.

**Masquer un profil** (ticket 166) : l'admin ouvre la fiche, choisit « Masqué » dans « Statut choisi par l'admin » et sauvegarde ; la page publique répond 404 et le profil sort de la recherche, du plan du site et du sitemap en moins d'une minute (les pages gardent leur lecture sous l'étiquette du profil, qu'un enregistrement rafraîchit). Le choix « Automatique » le remet en ligne, dans le sitemap s'il est publiable. La rédaction ne change aucun statut. Le motif et le journal de la modération viennent avec le ticket S13, après la bascule.

Tests : `tests/unit/profiles-status-filter.test.ts`, sur le banc `tests/integration/admin-profile-list.test.ts` (les 12 profils du banc, le tri, les refus, le masquage), et `tests/e2e/admin-profiles.spec.ts` (E53, E56 sans journal).

### La liste des comptes dans l'administration

La liste de `pros` montre, dans l'ordre : l'adresse, la création, « Adresse confirmée », « Bloqué », la dernière connexion et la présence d'un profil, le compte le plus récent d'abord (`defaultSort: '-createdAt'`). La dernière activité d'un compte est pour l'instant sa dernière connexion (`lastSignInAt`) : `derniereActivite` du plan n'existe pas encore (`docs/migration/SCHEMA.md`, §9). La colonne « Profil » lit le champ `profil`, un champ de jointure vers `profils.pro` : il n'a ni colonne ni migration, et seul un admin le lit.

Au-dessus du tableau, trois liens donnent le nombre de comptes « non confirmés », « sans profil » et « bloqués » et filtrent la liste (`src/components/admin/AccountFilters.tsx`, la règle dans `src/lib/account/admin-filters.ts`). Ce sont des filtres du panneau : ils se combinent avec les autres. Le panneau ne sait pas filtrer sur un champ de jointure (il plante), donc « sans profil » nomme les propriétaires de profils (`where[id][not_in]`), lus à chaque affichage ; l'API REST accepte aussi `where[profil][exists]=false`. Au-delà de quelques centaines de profils, l'adresse deviendrait longue : il faudrait alors une case stockée.

**Bloquer** (ticket 168) : l'admin ouvre la fiche du compte, coche « Bloqué » dans la colonne de droite et sauvegarde. Les sessions du compte sont fermées et sa connexion est refusée (ticket 089) ; décocher rend l'accès. La rédaction ne voit pas la collection et ne change aucun blocage.

Tests : `tests/unit/admin-account-filters.test.ts`, sur le banc `tests/integration/admin-account-list.test.ts` (les 20 comptes du banc, les trois filtres, le blocage par l'API) et `tests/e2e/admin-accounts.spec.ts` (la liste, le filtre, le blocage depuis la fiche, une capture à 390 px).

### Corbeille des photos

Une photo qui ne sert plus part à la corbeille du stockage, jamais à la suppression directe : l'application n'efface jamais un objet. La règle du déplacement est dans `src/lib/trash.ts`, le moment où une photo ne sert plus dans `src/collections/trash.ts`, et le détail au §8 de [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md).

- La corbeille est le dossier `deleted/`, à la racine du stockage : `media/photo.webp` y devient `deleted/media/photo.webp`, avec chacune de ses tailles dérivées. L'objet y est copié, la copie est vérifiée, puis l'original est retiré : c'est le seul retrait de l'application (`src/lib/storage.ts`), et un test échoue si un autre fichier en fait un.
- Une photo part à la corbeille quand son média est supprimé, quand son fichier est remplacé, ou quand plus rien ne la désigne après un enregistrement ou la suppression de son profil : le serveur supprime alors lui-même son média. Une photo encore désignée par un profil, un article ou une version d'article reste où elle est.
- Le greffon de stockage supprimait lui-même les objets : il n'en supprime plus aucun (`withTrash`, dans `src/payload.config.ts`).
- Si le stockage tombe pendant un déplacement, ce qui avait déjà bougé est remis en place, une fois, et la requête échoue en 503 avec le message « Le stockage des photos ne répond pas : rien n’a été modifié. Réessaie dans quelques minutes. ». Documents et objets restent comme avant.
- Les médias et les profils se suppriment et se modifient un par un, par leur identifiant. Une opération sur plusieurs à la fois, par un filtre `where`, est refusée en 403 avant toute écriture, par toutes les API, l'API locale sans contrôle d'accès comprise (`oneAtATime`) : Payload l'enregistrerait même si le stockage tombait pour l'un d'eux. La liste de l'administration n'offre donc plus de supprimer ni de modifier plusieurs lignes de ces deux collections. Seul l'import y échappe.
- Sans stockage d'objets (`S3_ENDPOINT` absent), le ménage d'un profil ne supprime aucun média : leur objet ne pourrait pas bouger.
- L'import n'y touche pas : sous son contexte, rien ne bouge.
- L'adresse publique d'une photo en corbeille ne répond plus. Sur le site, le cache de R2 peut encore la servir quelques heures. Une règle du stockage efface la corbeille au bout de 30 jours : elle se pose à la main dans R2 (ticket 205). D'ici là, `restore` (`src/lib/trash.ts`) remet un objet à sa place.
- Le journal du serveur écrit une ligne `[corbeille]` par déplacement : combien d'objets, jamais leurs clés.

Tests : `tests/unit/trash.test.ts`, et sur le banc `tests/integration/media-trash.test.ts`, où chaque requête de l'application au stockage est espionnée (`tests/support/s3-spy.ts`, voir [`docs/tests/banc.md`](docs/tests/banc.md)).

### Rafraîchissement des pages publiques

Quand un profil, un article ou un talent est créé, modifié ou supprimé, le serveur dit à Next quelles pages publiques ne sont plus à jour : il les nomme par leur adresse (`revalidatePath`) et par leurs étiquettes (`revalidateTag`). La règle est dans `src/lib/revalidate.ts`, les crochets de Payload dans `src/collections/revalidate.ts` :

| Document | Pages rafraîchies | Étiquettes |
|---|---|---|
| Profil | `/profil/<slug>`, `/search`, `/site-map`, `/sitemap.xml` | `profil:<slug>`, `profils` |
| Article | `/blog/<slug>`, `/blog`, `/site-map`, `/sitemap.xml` | `article:<slug>`, `articles` |
| Talent | `/talent/<slug>`, `/` (l'accueil liste les talents), `/site-map`, `/sitemap.xml` | `talent:<slug>`, `talents` |

- **Seul compte ce que voit le public.** Un document est rafraîchi s'il est public avant ou après l'enregistrement : un profil `published`, un article ou un talent publié. Un brouillon qui reste brouillon, un profil masqué qui le reste ne rafraîchissent rien. Quand l'adresse d'un document publié change, l'ancienne page et la nouvelle le sont toutes les deux.
- **L'état public se lit dans la ligne enregistrée**, avant et après l'écriture, quels que soient les champs que la requête choisit ou peut lire. Pour un article ou un talent, c'est le document publié, jamais la version en brouillon enregistrée par-dessus : un article retiré alors qu'un brouillon plus récent l'attend est bien rafraîchi. Un brouillon enregistré sur un article publié le rafraîchit aussi, pour rien : rien ne le distingue d'une modification de la version publiée.
- **Une étiquette expire tout de suite** (`{ expire: 0 }`), sans être servie périmée une dernière fois : un profil masqué ou des coordonnées retirées ne sont plus servis dès la visite suivante.
- **Une lecture mise en cache porte les étiquettes de ce qu'elle lit** (`TAGS`) : celle de la liste pour plusieurs documents (la recherche, le sitemap, le plan du site, l'accueil), celle du document pour un seul. Depuis le ticket 117, la page d'un profil, celle d'un talent et celle d'un article gardent aussi leur lecture dans le cache (`cachedProfileUrl`, `cachedTalent`, `cachedArticle`, dans `src/services/public/cached.ts`), sous l'étiquette de leur document : une page qui n'a pas changé ne demande rien à la base, et un enregistrement la rafraîchit à la visite suivante, donc en moins d'une minute. Seul un document que le public voit est gardé : une adresse inconnue, un brouillon, un profil masqué ou une redirection sont relus à chaque visite, pour qu'une adresse inventée ne remplisse pas le cache. Les pages elles-mêmes restent rendues à chaque requête (`force-dynamic`) : le build n'a pas de base, et une page statique garderait un 404 ou une liste vide. Essai : `tests/e2e/page-freshness.spec.ts`.
- **L'import ne rafraîchit rien**, et ne lit rien pour cela : il porte le contexte d'import ([`docs/migration/IMPORT.md`](docs/migration/IMPORT.md)).
- **Next ne prend un rafraîchissement que pendant une de ses requêtes** : l'API REST, l'administration, une Server Action. Hors de là (un script, l'API locale dans un test, une tâche de fond), l'enregistrement passe, et les pages gardent leur cache jusqu'à ce qu'il expire. Un rafraîchissement qui échoue n'annule jamais l'enregistrement : l'erreur est journalisée.

Tests : `tests/unit/revalidate.test.ts`, et sur le banc `tests/integration/revalidate.test.ts` (I21), qui écoute Next par l'espion du cache (`tests/support/cache-spy.ts`, voir [`docs/tests/banc.md`](docs/tests/banc.md)).

### Réseaux et coordonnées dans l'espace

Deux cartes de `/auth/profil` s'éditent dans le panneau commun (tickets 125 et 126). Chacune a une règle pure, lue par le formulaire et par l'action serveur, et une fonction d'enregistrement qui suit le contrat de l'identité : session relue, origine contrôlée, profil trouvé par le compte, écriture avec les règles d'accès, valeurs rendues telles que la base les a gardées, message en français sinon.

- **Réseaux** (`src/lib/dashboard/networks.ts`, `save-networks.ts`) : Instagram, Facebook, YouTube, LinkedIn et site web. `normalizeNetwork` range « @pseudo », un pseudo seul ou une adresse en une seule adresse `https://` : `@studio` et `https://www.instagram.com/studio/` donnent la même valeur (U28). L'adresse d'un autre site dans le champ d'un réseau est refusée sous le champ (E30) ; le site web accepte toute adresse web, jamais un `@pseudo`. Un champ vidé retire le réseau. Un réseau compte comme canal de contact pour la complétude. Une clé hors des cinq champs refuse la requête entière.
- **Coordonnées** (`src/lib/dashboard/contact-details.ts`, `save-contact-details.ts`) : téléphone (20 caractères au plus, de 9 à 15 chiffres), email de contact, et son choix d'afficher les deux sur sa page. La date et la source du choix sont posées par le serveur (`consentTrace`) : la requête ne les porte pas, et le schéma strict refuse `consentedAt`. Choix coupé : la date est effacée, la page publique ne lit plus rien. Coordonnées masquées et aucun réseau : le profil n'est pas publiable. La carte dit « Oui, depuis le … » quand le choix est daté.
- **Langues et compétences** (`src/lib/dashboard/bullets.ts`, `save-bullets.ts`, `src/components/dashboard/BulletsEditor.tsx`, tickets 127 et 128) : une seule liste de puces pour les deux. Le nom est rogné, jamais vide, 70 caractères au plus ; un doublon (même nom sans les espaces autour ni la casse) est refusé avec un message près du champ ; un « ; » termine un nom. Chaque puce a son identifiant (celui du serveur, ou un identifiant local jamais envoyé) : deux puces de même nom se retirent une par une. Après un retrait, le focus va sur la puce qui prend la place, sinon celle du dessus, sinon le champ (clavier) ou le titre du panneau (clic, doigt) ; chaque retrait est dit dans une zone `role="status"`. Entrée maintenue n'agit qu'une fois. Le serveur refuse une puce neuve qui double une autre, mais garde les doublons déjà stockés (import) ; la description d'une compétence, que les puces ne montrent pas, est reprise de la ligne stockée. Le composant reçoit le nom de la liste (`languages` ou `skills`), pas ses messages : une page serveur ne peut pas passer de fonction au navigateur. Tests : `tests/unit/dashboard-bullets.test.ts`, `tests/unit/dashboard-bullets-panel.test.tsx` (L1 à L7, E30, E31), sur le banc `tests/integration/dashboard-bullets.test.ts`, et `tests/e2e/dashboard-bullets.spec.ts`.
- **Lecture de la page** : `artistProfile` lit aussi `pro` pour la règle d'accès des champs fermés au public (sans lui, Payload retirerait `contactDetails`, `publicContact` et `consentedAt` de sa propre page), puis le retire avant de rendre le profil.

Tests : `tests/unit/dashboard-networks.test.ts`, `tests/unit/dashboard-contact-details.test.ts`, `tests/unit/dashboard-networks-contact-details-panels.test.tsx`, sur le banc `tests/integration/dashboard-networks-contact-details.test.ts`, et `tests/e2e/dashboard-networks-contact-details.spec.ts`. Un groupe `networks` ou `contactDetails` envoyé à `null` vaut le groupe vidé, comme la commune (`emptyGroupIfNull`, `src/lib/profile/contact-details.ts`) : Payload répondait 500 (ticket 224, `tests/integration/profile-contact.test.ts`).

### Expériences, formations et prestations dans l'espace

Trois cartes de `/auth/profil` s'éditent ligne par ligne dans un panneau commun (tickets 129, 130 et 131) : une liste de lignes, avec « Modifier » et « Retirer » sur chacune, un formulaire qui ajoute ou change une ligne, et « Enregistrer » qui envoie la liste entière. Les trois partagent un éditeur (`src/components/dashboard/ListEditor.tsx`) et une description par section (`ListDefinition`, `src/lib/dashboard/list.ts`) : `experiences.ts`, `courses.ts` et `service-offers.ts` disent les champs, ce qui est obligatoire, les bornes et la façon de lire et d'écrire une ligne stockée. Le formulaire et le serveur lisent ces mêmes règles, qui appellent celles de la collection (`src/lib/profile/lists.ts`) et du prix (`src/lib/price.ts`).

- **Les sept règles des listes** (`docs/qualite.md`, §3) sont tenues par l'éditeur : clé d'affichage propre à chaque ligne (L1, L2), retrait de la ligne en cours (L3), focus après un retrait (L4), zone `role="status"` (L5), doublon refusé avec un message (L6), Entrée maintenue une fois (L7). Entrée maintenue garde ses retours à la ligne dans un texte long : `EditingPanel` ne retient plus les répétitions d'Entrée dans un `textarea`.
- **Enregistrement** (`src/lib/dashboard/save-list.ts`, action dans `lists-actions.ts`) : schéma strict (les lignes, chacune avec ses textes, aucune autre clé : une requête ne peut pas porter un montant de prix), profil trouvé par le compte, liste écrite entière dans l'ordre envoyé, identifiants gardés par la collection. Les bornes valent pour chaque ligne ; l'obligation (entreprise, poste et début ; diplôme et école ; nom) ne vaut que pour une ligne neuve ou changée, pour qu'une ligne importée avec un champ vide ne bloque jamais les autres. Un échec rend un message en français et laisse la base telle quelle (E31).
- **Dates** (U30) : la fin d'une expérience ne précède pas son début ; une formation n'est pas datée de plus d'un an après aujourd'hui.
- **Prix** (U29) : une seule saisie (« 80 », « 80 € », « à partir de 80 », « sur devis »), plusieurs formules séparées par « ; ». Le serveur en tire le montant par `parsePrice` et garde le texte ; le formulaire dit le montant retenu. Une prestation chiffrée remplit le critère « publiable » (U04). Les options d'une prestation (ticket 132) se saisissent dans le même panneau, sous la prestation ouverte par « Modifier » : chacune a son nom (requis), sa description et son prix, lus par les mêmes règles ; la clé d'affichage de chaque option est tirée à sa création, jamais de son contenu, donc taper dans ses champs, y compris juste après un enregistrement, ne déplace pas le focus (L2). Une option identique à une autre de la même prestation est refusée (L6), un retrait est annoncé et garde le focus (L4, L5), Entrée maintenue n'ajoute ni ne retire qu'une option (L7). Le serveur écrit les options reçues dans l'ordre, chacune gardant son identifiant (L1) ; une requête sans `options` garde celles qui sont stockées. Code : `src/components/dashboard/OptionsEditor.tsx`, `src/lib/dashboard/service-offers.ts` (`SERVICE_OFFER_OPTIONS`).

Tests : `tests/unit/dashboard-lists.test.ts`, `tests/unit/dashboard-lists-panels.test.tsx` (L1 à L7 jouées sur les trois sections) et, sur le banc, `tests/integration/dashboard-lists.test.ts`.

### Photos dans l'espace

Les cartes « Photo principale » et « Portfolio » de `/auth/profil` s'éditent dans le panneau commun (tickets 134 à 136). Une photo ne passe jamais par une action serveur : le navigateur l'envoie à la route de médias de Payload (`POST /api/media`, où le ticket 133 contrôle le type, le poids et le nom), puis une action serveur nomme les photos sur le profil.

- **Réduction dans le navigateur** (`src/lib/dashboard/photo.ts` pour les décisions, `browser-photo.ts` pour le canvas) : JPEG, PNG ou WebP lus dans les octets, 25 Mo au plus au choix, puis 2 000 px au plus sur le grand côté, WebP (JPEG si le navigateur ne sait pas encoder le WebP), 1 Mo au plus, par paliers de qualité. Les messages sont ceux du site en ligne, au mot près. Le réencodage retire l'EXIF.
- **Rien n'est envoyé avant « Enregistrer »** : fermer le panneau ne crée aucun objet.
- **Le geste « envoyer puis enregistrer »** est dans `src/lib/dashboard/photos-upload.ts`, avec ses trois issues séparées. Un fichier refusé ou une coupure du réseau pendant l'envoi : rien n'est enregistré, les fichiers déjà envoyés dans le geste sont supprimés (ils vont à la corbeille). Un « non » explicite du serveur : de même. Un appel au serveur qui se perd (résultat inconnu) : **rien n'est supprimé**, car l'enregistrement a pu aboutir ; la maquilleuse est invitée à recharger la page, et le rapprochement du ticket 137 voit les éventuels objets laissés. Session expirée : rien n'est supprimé non plus (elle n'en aurait pas le droit), le fichier envoyé est gardé pour le nouvel essai.
- **Photo principale** (`save-photo.ts`, action `saveMyMainPicture`) : le schéma strict ne prend qu'un identifiant. L'ancienne photo part à la corbeille par les crochets du profil (ticket 045), dans la même transaction.
- **Portfolio** (`portfolio.ts`, `save-portfolio.ts`, action `saveMyPortfolio`) : le serveur reçoit la liste entière des identifiants, dans l'ordre voulu, 10 au plus (U80), aucun deux fois. Les photos ajoutées se placent après celles qu'elle avait. Le panneau choisit plusieurs fichiers d'un coup ; un fichier refusé est écarté avec son nom et sa cause, sans perdre les autres ; le même fichier choisi deux fois est refusé (règle L6). Chaque photo est envoyée avec le texte alternatif « Photo du portfolio », et l'aperçu d'une ligne dit son rang (« Photo 2 sur 5 de ton portfolio »).
- **Retrait** (ticket 136) : retirer une photo ne change rien tant qu'elle n'a pas enregistré. À l'enregistrement, la liste sans la photo est écrite, et les crochets du profil envoient l'objet (original et tailles) à la corbeille s'il n'est plus désigné par rien : une photo encore principale reste en place (I25). Le navigateur ne supprime jamais lui-même une photo enregistrée. Le retrait suit les règles de liste : une clé par ligne (L1), le focus reste dans le panneau (L4), une annonce `role="status"` par retrait, renouvelée quand la phrase se répète (L5), Entrée maintenue ne retire qu'une photo (L7). Sans objet pour une photo : L2 (aucun champ de saisie dans une ligne) et L3 (aucun formulaire de modification).
- **Lecture** : `readDashboardPhotos` (`src/lib/dashboard/photos.ts`) lit les médias que le profil désigne, par ses identifiants et jamais par la requête.

Tests : `tests/unit/dashboard-photo.test.ts`, `tests/unit/dashboard-photo-panel.test.tsx`, `tests/unit/dashboard-portfolio-panel.test.tsx`, sur le banc `tests/integration/dashboard-photo.test.ts` et `tests/integration/dashboard-portfolio.test.ts` (qui rejoue le rapprochement du ticket 137 : 0 orphelin), et `tests/e2e/dashboard-photo.spec.ts`, `tests/e2e/dashboard-portfolio.spec.ts` (une photo de 8 Mo faite pour l'occasion : `tests/support/photo-8-mb.ts`).

### Où en est le profil (ticket 138)

En tête de l'espace, `ProfileProgress` (`src/components/dashboard/`) dit où en est le profil : pourcentage (score sur 13), état (vide, pas encore publiable, publiable, compte interne), ce que l'état change (un profil entièrement vide n'est pas listé dans la recherche ; seul un profil publiable est indexé), et la liste des manques, chacun lié à sa carte (`#carte-<section>`), les points requis pour être publiable d'abord. `profileProgress` (`src/lib/dashboard/progress.ts`) ne calcule rien : il formule la définition unique (`src/lib/profile/completeness.ts`) lue par le même passage de champs que la sauvegarde du serveur. Le bloc est rendu côté serveur ; chaque enregistrement rafraîchit la page (`revalidatePath`), donc il bouge sans rechargement.

Tests : `tests/unit/dashboard-progress.test.tsx` (U01, U02, U04 à U08), sur le banc `tests/integration/dashboard-progress.test.ts` (I20 : le bloc égale l'état stocké) et `tests/e2e/dashboard-progress.spec.ts`.
- Recette de l'espace (ticket 142) : `tests/e2e/dashboard-acceptance.spec.ts`, jouée aux deux tailles après les sections : axe sur la page de l'espace, sur chacun des 12 panneaux et sur la fenêtre de suppression, sur l'accueil en trois étapes (E67) ; Échap ferme chaque panneau et rend le focus à son bouton (E68) ; la photo principale changée suit jusqu'au profil public et à son `og:image` (E37) ; zoom à 200 % (largeur de moitié, 320 px au plus bas) sans défilement de côté ni éléments qui se recouvrent. Les orphelins du stockage après la suite sont comptés par l'étape `bench:reconcile --outside-import` de la CI (ticket 137). Voir [`docs/tests/e2e.md`](docs/tests/e2e.md).
- Profil ouvert dans l'administration (ticket 224, `src/lib/dashboard/lock.ts`) : Payload ne contrôle pas les versions et l'API locale ignore le verrou d'édition (`overrideLock` vaut vrai par défaut, vérifié dans Payload 3.90.2). Chaque enregistrement de l'espace passe donc par `profileIdToWrite`, qui refuse (`LockedProfile`) tant qu'un compte de l'administration tient un verrou de moins de 5 minutes sur le profil : la maquilleuse lit « Ton profil est en cours de modification par l'équipe, réessaie dans quelques minutes. », rien n'est écrit, sa saisie reste dans le formulaire. Le contrôle est le nôtre et non `overrideLock: false`, qui ne compare que le numéro du compte (une maquilleuse du même numéro que l'admin passerait). Test : `tests/integration/dashboard-lock.test.ts`.

## Démarrer en local

Il faut [bun](https://bun.sh) 1.3.14, Node 24 (`.nvmrc`), Docker avec Compose et `openssl`.

### 1. Installer

```sh
bun install --frozen-lockfile
```

### 2. Créer le fichier `.env` (une seule fois)

```sh
test -e .env || printf 'DATABASE_URI=postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev\nPAYLOAD_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
```

Cette commande écrit les deux variables obligatoires de `.env.exemple` :

- `DATABASE_URI` : l'adresse de la base locale de `docker-compose.yml`. Ces identifiants sont jetables et ne servent qu'à cette base.
- `PAYLOAD_SECRET` : un secret tiré au hasard par `openssl`, propre à ce poste.

Elle ne touche pas à un fichier `.env` déjà présent. Sans ce fichier, l'application refuse de démarrer : elle nomme les variables qui manquent et s'arrête.

Le fichier `.env` n'est jamais versionné. Il ne doit jamais contenir l'adresse d'une base distante. Garde-fou : Payload ne pousse son schéma que dans une base de ce poste (voir « Configuration durcie »).

### 3. Démarrer la base

```sh
docker compose up -d --wait
```

PostgreSQL écoute sur `127.0.0.1:5442`, donc sur ce poste seulement. Le port 5432 est laissé libre pour les autres projets.

Sans démon Docker, avec Podman : ajouter `DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock` devant chaque commande `docker compose`.

### 4. Démarrer l'application

```sh
bun run dev
```

- Accueil provisoire : <http://localhost:3000>
- Espace maquilleuse : <http://localhost:3000/auth>
- Administration : <http://localhost:3000/admin>. À la première visite, Payload crée ses tables. L'écran du premier compte est fermé : crée le tien par `bun run admin:create <ton adresse>` (voir « Créer un compte admin »).

Le serveur de développement n'écoute que sur `127.0.0.1` : il n'est pas joignable depuis le réseau local.

Si le port 3000 est pris : `PORT=3100 bun run dev`.

### Arrêter

```sh
docker compose down      # arrête la base, garde les données
docker compose down -v   # arrête la base et efface les données
```

## Configuration durcie

### Variables d'environnement

L'application vérifie ses variables à chaque démarrage (`bun run dev`, `bun run start`, image Docker). S'il en manque une, ou si une valeur est refusée, elle s'arrête aussitôt et liste les variables à corriger. Le message ne montre jamais une valeur.

| Variable | Règle |
|---|---|
| `DATABASE_URI` | Obligatoire. Une adresse `postgres://` avec un hôte et un nom de base. |
| `DATABASE_POOL_MAX`, `DATABASE_POOL_TIMEOUT_MS` | Facultatives (ticket 268). La taille du pool de connexions à la base (un entier de 1 à 50, **10** par défaut) et l'attente la plus longue d'une connexion libre (en millisecondes, de 1000 à 30000, **5000** par défaut). Au-delà de l'attente, la requête échoue avec une erreur franche et le pool sert les suivantes : jamais un blocage. Une valeur hors bornes, ou `0`, arrête le démarrage. Pour un seul conteneur, les défauts suffisent ; la somme des pools de tous les conteneurs doit rester sous `max_connections` de PostgreSQL (100 par défaut). Mesures et cause de l'échec de la CI : [`docs/pool-connexions.md`](docs/pool-connexions.md). |
| `PAYLOAD_SECRET` | Obligatoire. 32 caractères au moins. |
| `NEXT_PUBLIC_SITE_URL` | Obligatoire en production (`bun run start`, image Docker), inutile pour `bun run dev`. Sans `/` final, et l'une de ces adresses seulement : `https://my-makeup.fr`, ou une adresse de ce poste comme `http://localhost:3000`. Aucun domaine temporaire n'entre dans le build : la production se construit directement pour `https://my-makeup.fr`. |
| `APP_ENV` | Facultative. Où l'application dit tourner : `test` (le banc de test, `.env.test`) ou `prod` (le site). Absente sur un poste de développement. Toute autre valeur est refusée, `preprod` comprise : l'application ne démarre pas, et le message nomme la variable sans jamais montrer sa valeur. |
| `CUTOVER_DATE` | Facultative. Le jour de la bascule depuis l'ancien site, au format `AAAA-MM-JJ`. Pendant les 90 jours qui suivent, `src/proxy.ts` expire les cookies de l'ancienne authentification (`next-auth.*`) à la première requête, et la page de connexion dit une fois à la maquilleuse de se reconnecter (ticket 081, `src/lib/auth/legacy-cookies.ts`). Absente, ils sont expirés sans date de fin, jusqu'au ticket 207 qui retire ce code. Illisible, elle arrête le démarrage. Le back-office, l'API et les fichiers ne sont pas touchés. |
| `PAYLOAD_DROP_DATABASE` | Refusée si la base n'est pas sur ce poste : avec `true`, Payload efface toutes les tables. |
| `R2_PUBLIC_URL` | Facultative. L'adresse publique des photos : `https://`, un hôte, sans chemin ni `/` final. Absente, c'est celle des photos du site en ligne, sauf sur le banc de test (voir plus bas). |
| `S3_ENDPOINT` | Facultative. L'API S3 du stockage d'objets des photos : `https://` et un hôte, ou sur ce poste `http://127.0.0.1:PORT`, sans chemin ni `/` final. Absente, aucune photo n'est reçue. Refusée si elle est sur ce poste alors que le site est déployé. |
| `S3_BUCKET` | Obligatoire dès que `S3_ENDPOINT` est réglée. L'espace des photos : 3 à 63 caractères, minuscules, chiffres, points et tirets. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Obligatoires dès que `S3_ENDPOINT` est réglée. La clé d'accès au stockage et son secret. |
| `SMTP_HOST` | Le relais SMTP par lequel partent tous les mails : un nom d'hôte seul, sans protocole ni port (Resend : `smtp.resend.com`). Facultative sur un poste et sur le banc : absente, l'application n'envoie rien et écrit une ligne de journal, sans adresse (y compris pour les mails propres à Payload : confirmation, mot de passe oublié), à la place de chaque mail. **Obligatoire sur le site** (`https://my-makeup.fr` en production), et refusée si elle désigne ce poste : l'application ne démarre pas. |
| `SMTP_PORT` | Obligatoire dès que `SMTP_HOST` est réglée. Le port du relais, de 1 à 65535. |
| `EMAIL_FROM` | Obligatoire dès que `SMTP_HOST` est réglée. L'expéditeur de tous les mails : `Nom <adresse@domaine>`, ou une adresse seule. |
| `SMTP_USER`, `SMTP_PASSWORD` | L'identifiant du relais et son mot de passe, toujours ensemble (Resend : `resend` et une clé d'envoi limitée au domaine d'envoi). Obligatoires sur le site. Le port 465 est chiffré d'emblée ; tout autre port doit passer en TLS avant l'envoi de l'identifiant. Le mot de passe ne figure dans aucun message d'erreur. |
| `AUTH_VERIFY` | Facultative. L'interrupteur d'exploitation de la confirmation d'email (ticket 082). Absente, vide ou `on` : un compte qui s'inscrit doit confirmer son email avant de se connecter, et le mail de confirmation part avec l'inscription. `off` : le compte est confirmé sur le champ, connecté aussitôt, et aucun mail ne part (le jour où le relais d'envoi est en panne ; sur un poste sans `SMTP_HOST`, c'est aussi la seule façon de s'inscrire). Toute autre valeur arrête le démarrage. Le build ne la lit pas. |
| `CONTACT_TO` | Facultative. Qui reçoit les messages du formulaire de contact (ticket 158) : une adresse seule. Absente, c'est l'adresse publique de l'équipe sur le site (`https://my-makeup.fr`) et une adresse du domaine réservé aux tests (`contact@example.test`) partout ailleurs : un poste et le banc n'écrivent à aucune vraie boîte. Une valeur illisible arrête le démarrage. |
| `STATS_TOKEN` | Facultative. Le jeton de service de `GET /api/stats/weekly`, que lit le rapport du lundi : 32 caractères au moins (`openssl rand -hex 32`). Absente, la route refuse tout le monde. Jamais donnée au build. |
| `INDEXNOW_KEY` | Facultative. La clé IndexNow (ticket 219, [`docs/seo/indexnow.md`](docs/seo/indexnow.md)) : 32 caractères hexadécimaux en minuscules (`openssl rand -hex 16`). Le site la sert à `/<clé>.txt` et prévient Bing et les moteurs du protocole quand une page publique change. Absente, rien n'est servi et rien n'est envoyé. Rien ne part ailleurs que du site (`https://my-makeup.fr`), ni pendant l'import. Une valeur illisible arrête le démarrage. Jamais donnée au build. |
| `STRAPI_SOURCE_URI` | Facultative. La base Strapi que lit l'import de l'ancien site : une adresse `postgres://` d'un **rôle en lecture seule**, sur le réseau interne de Coolify, jamais une base ouverte sur Internet. Elle est lue par `bun run migration:import` et par l'import que le conteneur déployé lance sur demande (voir `IMPORT_TOKEN`). Un secret, posé au runtime. Jamais la base de Payload. |
| `IMPORT_TOKEN` | Facultative, **sur le site seulement** (`NODE_ENV=production`, `APP_ENV=prod`, `NEXT_PUBLIC_SITE_URL=https://my-makeup.fr`). Un jeton de 8 à 64 caractères (minuscules, chiffres, tirets, comme `2026-11-02-essai-1`) fait lancer l'import de l'ancien site par le conteneur, une seule fois par jeton, quel que soit le mode : un passage arrêté prend un jeton neuf. Exige `STRAPI_SOURCE_URI` et le stockage des photos. Voir `docs/migration/IMPORT.md`, « En production ». |
| `IMPORT_MODE`, `IMPORT_DECISIONS`, `IMPORT_CONSENT_DATE`, `IMPORT_CITIES`, `IMPORT_TARGET_IN_SERVICE` | Facultatives, avec `IMPORT_TOKEN`, sur le site seulement : une de ces variables ailleurs arrête le démarrage. `IMPORT_MODE` : `dry-run` (par défaut), `real` ou `check`. `IMPORT_DECISIONS` : la table de décision en JSON, des identifiants seulement. `IMPORT_CONSENT_DATE` : la date de bascule. `IMPORT_CITIES` : les réponses gardées du référentiel des communes, en JSON. `IMPORT_TARGET_IN_SERVICE` : `oui` seulement, jamais avec `check`. |
| `UMAMI_ORIGIN` | Facultative. L'instance Umami vers laquelle le site relaie sa mesure d'audience, sous son propre chemin `/u` : `https://HÔTE` (un chemin est permis, jamais de paramètres). Absente, c'est l'instance actuelle sur le site (`https://my-makeup.fr`), et rien ailleurs : `/u` répond 404. Une instance de ce poste est refusée sur toute adresse déployée. Sur ce poste seulement, le faux Umami du banc, comme `http://127.0.0.1:4200`. Jamais donnée au build. |
| `NEXT_PUBLIC_UMAMI_DOMAINS` | Facultative. Les noms d'hôte sur lesquels Umami compte les visites, séparés par des virgules. Absente, `my-makeup.fr` et `www.my-makeup.fr` : un build local ou une copie du site n'envoie rien. Lue à la construction des pages : donne-la au build. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Facultatives, ensemble : le client OAuth de la console Google. Sans elles, le site n'a pas de bouton Google. Des secrets : réglés par Coolify au runtime, jamais dans un fichier ni au build. L'adresse de retour à déclarer dans la console est `<NEXT_PUBLIC_SITE_URL>/auth/google/callback`. Sur le banc de test, `.env.test` les règle sur le client factice du faux Google. |
| `GOOGLE_OIDC_ISSUER` | Facultative. Le fournisseur auquel parle la connexion Google. Absente, c'est Google : `https://accounts.google.com`. Sur ce poste seulement, l'adresse du faux Google du banc de test, comme `http://127.0.0.1:7080`, sans `/` final. Refusée sur le site. |

- `bun run build` est la seule exception : il ne vérifie rien, sauf `R2_PUBLIC_URL`, et passe sans secret ni base.
- Le CLI de Payload (`bun run payload`, `payload:types`, `payload:importmap`, `payload:migrate`…) charge la même configuration : sans `DATABASE_URI` et `PAYLOAD_SECRET` valides, il s'arrête avec le même message. Le `.env` de l'étape 2 de « Démarrer en local » suffit.
- `payload:types` et `payload:importmap` n'ouvrent aucune connexion : la base peut être arrêtée. Sur un clone sans `.env` (la CI, par exemple), deux valeurs de remplissage passées dans l'environnement suffisent : une adresse `postgres://` bien formée, sans base derrière, et 32 caractères quelconques.
- `NEXT_PUBLIC_SITE_URL` est publique. Présente au moment du build, même vide, elle est figée dans le build. Absente du build, elle est lue au démarrage.
- `https://v3.my-makeup.fr`, l'adresse provisoire de la prod avant la bascule, reste refusée dans `NEXT_PUBLIC_SITE_URL` : la prod est construite directement pour `https://my-makeup.fr`, aucun ticket n'ajoute d'adresse temporaire à `DEPLOYED_ORIGINS` (`src/lib/env.ts`).
- `R2_PUBLIC_URL` est publique. Elle est lue plus tôt que les autres, quand Next charge `next.config.ts` : une valeur refusée arrête aussi le build. Voir « Images ».
- `NEXT_PUBLIC_APP_VERSION` et `SOURCE_COMMIT` sont facultatives. Elles sont lues dans `src/lib/env.ts` sans être vérifiées : aucune valeur n'arrête le démarrage (voir « Route de santé »). `next.config.ts` lit aussi `SOURCE_COMMIT`, au moment du build, pour le figer dans le build : il le lit lui-même, par son nom. De `src/lib/env.ts`, il n'appelle que `mediaOrigin`, pour `R2_PUBLIC_URL`.
- `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`, `SMTP_USER` et `SMTP_PASSWORD` règlent l'adaptateur d'email de Payload. Elles ne se donnent jamais au build. Aucune connexion n'est ouverte au démarrage : un relais injoignable fait échouer l'envoi du mail, pas le démarrage. Sans identifiant, le relais est utilisé tel quel, sans chiffrement : cela ne convient qu'au capteur de mails du banc de test, où `.env.test` règle les trois premières.
- **Un email part par un seul point d'envoi** (`src/lib/emails/`, ticket 073), passé comme dépendance : `payloadSendEmail(payload, env)` rend un `SendEmail`. Le gabarit commun (`composerEmail`) écrit le texte et le HTML en français, avec un lien absolu construit depuis un chemin du site ; un lien qui sort du site, un sujet sur deux lignes ou un destinataire illisible sont refusés. Avec le contexte d'import (`IMPORT_CONTEXT`), rien ne part. Sans relais, rien ne part non plus et une ligne de journal le dit. Un relais en échec donne une `EmailSendFailed` à l'appelant, une phrase qu'on peut montrer ; le journal garde la nature de la panne, jamais l'adresse, le sujet, le lien ni le jeton. Un test d'intégration lit l'email dans le capteur du banc (`tests/integration/emails.test.ts`).
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` et `S3_SECRET_ACCESS_KEY` règlent le stockage des photos (`@payloadcms/storage-s3`) : Cloudflare R2 sur le site, le simulateur S3 sur le banc de test, où `.env.test` les règle. Elles ne se donnent jamais au build. Sans elles, la collection `media` garde ses champs (le schéma ne dépend pas de l'environnement), mais une photo envoyée est refusée : rien n'est jamais écrit sur le disque du serveur.
- L'adresse publique d'une photo est la base des photos, puis la clé de son objet : son préfixe (`media/` pour une photo envoyée dans la v3), puis son nom de fichier. La base est `R2_PUBLIC_URL` ; sans elle, sur le banc de test, c'est le simulateur et son espace (`http://127.0.0.1:9090/mymakeup-test`), sinon l'hôte des photos du site en ligne. La règle est dans `src/lib/media.ts`. La route de fichier de Payload, `/api/media/file/<nom>`, ne lit jamais le disque : elle renvoie par une redirection (302) vers cette adresse, pour qui peut lire le média.
- Un média nomme toujours son objet : une création qui n'a pas de nom de fichier est refusée (400), comme un envoi sans fichier. Seul l'import crée un média sans recevoir de fichier : il adopte une photo de l'ancien site là où elle est, avec le préfixe et le nom lus dans son adresse, sans rien écrire dans le stockage (ticket 058, `docs/migration/IMPORT.md`, « Les photos »).
- `GOOGLE_OIDC_ISSUER` fait prendre le faux Google du banc de test pour Google (voir « Le banc de test »). Une adresse locale est refusée dès que `NEXT_PUBLIC_SITE_URL` est celle du site, quel que soit le mode : l'application s'arrête au démarrage. Un build de production servi sur ce poste, comme pour les essais de bout en bout, l'accepte. La connexion Google (ticket 090) lit cette variable par `serverEnv().googleIssuer`, avec le client et le secret de `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` : son code est dans `src/lib/auth/google/`, ses deux adresses sont `/auth/google` (le départ, derrière le bouton) et `/auth/google/callback`.
- Une nouvelle variable s'ajoute dans `src/lib/env.ts` et dans `.env.exemple`, par le ticket qui commence à la lire.

### Base de données

- Payload ne pousse son schéma que dans une base de ce poste : hôte `localhost`, `127.0.0.1` ou `::1`. Un nom de service Docker ou une adresse privée ne compte pas.
- Partout ailleurs, le schéma change par les migrations versionnées de `src/migrations/`, que Payload joue quand il démarre en production. `bun run payload:migrate:create` en écrit une, à relire avant de la versionner.
- La migration `init` porte tout le schéma (ticket 049) : démarrée en production sur une base vide, l'application crée ses tables à son premier appel (voir « Image Docker »). Tout changement de collection vient ensuite avec sa propre migration, dans le même commit : la CI le vérifie (`bun run schema:drift`, voir `docs/qualite.md`, « La dérive de schéma »). Après `bun run payload:migrate:create`, passer `bun run check` : Biome remet en forme les fichiers écrits par Payload.
- Le banc de test ne pousse pas le schéma : sa base est construite par les migrations seules, et ses tests refusent de tourner sur une base que les migrations ne construisent pas comme le code la décrit (voir `docs/tests/banc.md`, « Préparer la base du banc »).
- Hors de ce poste, une base qui n'existe pas est une erreur : Payload ne la crée pas.
- Chaque processus ouvre 5 connexions au plus. Une requête qui n'obtient pas de connexion en 5 secondes échoue avec une erreur au lieu d'attendre pour toujours (`src/lib/pool-base.ts`, ticket 222).
- Une connexion inactive que PostgreSQL coupe (arrêt, redémarrage) ne tue pas le serveur : le pool a un écouteur d'erreur (`listenToPool`, `src/lib/pool-base.ts`, posé au démarrage de Payload) qui écrit une ligne courte avec le code de l'erreur, jamais son message ni l'adresse de la base. Pendant la panne `/api/health` répond 503, puis 200 au retour de la base, sans redémarrage (ticket 223).

### Connexion et frein

- La connexion est une Server Action (`src/app/(front)/(dashboard)/auth/signin/actions.ts`). Le jeton de session n'existe que dans le cookie `payload-token` (HttpOnly, SameSite=Lax, Secure en production, 14 jours) : aucune réponse de l'API, aucune page ne le porte.
- La session dure 14 jours et glisse : une visite d'une page privée (`<RefreshSession />`, `src/components/dashboard/`) la prolonge de 14 jours par `POST /api/pros/refresh-token` quand il en reste moins de 7, une fois par chargement de page, jamais depuis une page publique. Elle ne dépasse jamais 90 jours depuis son ouverture : le nouveau jeton est raccourci près du plafond (hook `refresh` de la collection `pros`) et un renouvellement à 90 jours est refusé en 403 (`beforeOperation`). Le cookie garde, lui, la date de fin de 14 jours : au-delà du plafond, c'est le jeton qui ne vaut plus rien. Tests : `tests/unit/sliding-session.test.tsx` (U67, U68), `tests/integration/auth-sliding-session.test.ts` (I16, horloge simulée), `tests/e2e/sliding-session.spec.ts` (E14, `@lent`).
- `/auth/profil` et `/auth/init-account` sans cookie : une seule redirection 307 vers `/auth/signin?callbackUrl=<page>` (`src/proxy.ts`). Avec un cookie qui ne vaut plus rien, la page elle-même fait la même redirection, et la connexion affiche son formulaire : une seule règle (`signedInArtist`) décide dans les deux sens, donc aucune boucle. La session d'un compte admin n'ouvre pas l'espace.
- **La déconnexion** (ticket 078) retire la session de la base : le jeton de cet appareil, rejoué, est refusé (`closeSession`, `src/lib/auth/sign-out.ts`). « Me déconnecter » ferme la session de l'appareil ; « Me déconnecter de tous les appareils » ferme toutes celles du compte, après une confirmation dans la page (`/auth/profil`), et jamais celles d'un autre compte. Les deux effacent le cookie, laissent une ligne au journal et mènent à l'accueil. Sans session, rien ne casse. La session d'un admin n'est pas touchée : le cookie porte le même nom, mais ce n'est pas une session de l'espace.
- **Un compte bloqué** (ticket 089, `pros.bloque`, que seul un admin change) ne se connecte plus. Avec le bon mot de passe, la connexion le dit (code `compte-bloque`, « Ce compte est bloqué. Écris-nous depuis la page contact pour en savoir plus. », 403 par `POST /api/pros/login`) ; avec un mauvais mot de passe, c'est le message générique, comme pour une adresse inconnue. Bloquer vide les sessions du compte dans la même écriture : tous ses jetons sont refusés, sur tous les appareils, et les comptes des autres ne sont pas touchés. Débloquer rend l'accès. Le journal garde une ligne `connexion` / `compte-bloque` par refus, et une ligne `blocage` ou `deblocage` par changement de l'indicateur (`src/lib/auth/blocked-account.ts`). Tests : `tests/unit/blocked-account.test.ts`, `tests/integration/auth-blocked-account.test.ts`. Le chemin de l'ancien mot de passe (ticket 087) et la connexion Google (090) devront aussi refuser un compte bloqué.
- **La Nav des pages publiques** montre « Mon espace » et « Me déconnecter » quand une session existe. Le cookie est HttpOnly et les pages publiques restent statiques, en cache : la Nav demande l'état au navigateur, après le chargement, à `GET /api/dashboard/session` (un booléen, jamais mis en cache, sans accès à la base quand le cookie manque). Tant que la réponse n'est pas venue, elle montre « Me connecter ».
- **Suites de l'authentification** (ticket 223). Une maquilleuse connectée qui ouvre une page de son espace depuis un autre site (un lien dans un mail) garde sa session : Payload ignore le cookie d'une navigation `Sec-Fetch-Site: cross-site` sans `Origin`, donc le proxy répond à cette seule navigation (`GET`, cookie valide) par la page de relais du retour Google (`src/lib/auth/relay-page.ts`), qui repart en navigation du site. Le cookie d'un renouvellement de session finit 90 jours après son jeton, comme celui de la connexion, et le jeton n'est pas dans la réponse (`extendUnderCap`, `src/lib/auth/session-cookie.ts`). Le retour Google prend une place du frein par adresse (10 échecs par 15 minutes, comme la connexion ; au-delà, retour à la connexion avec « Trop d'essais, réessaie dans quelques minutes. », code `trop-de-tentatives`), et ses lignes `retour-invalide` et `trop-de-tentatives` au journal sont bornées à 3 par heure et par adresse. Un compte bloqué (`CompteBloque`) est écrit au niveau `info` par Payload, comme les autres refus normaux (un mauvais mot de passe, une adresse non confirmée et « Missing ID » aussi : sur le build de production les classes d'erreur de Payload sont renommées par la minification, donc le patch de `payload` lit le niveau par le constructeur, `patches/payload@3.90.2.patch`) ; l'administration n'affiche plus d'avatar venu de gravatar.com (`admin.avatar: 'default'`). Une adresse au pourcentage mal formé (`/profil/%E0%A4%A`) répond la page 404 du site, par le proxy (sous `/api/`, un 400 en JSON) ; une réponse à laquelle le proxy ajoute un cookie d'effacement est `private, no-store`. Tests : `tests/unit/proxy-auth-findings.test.ts`, `tests/unit/pool-base.test.ts`, `tests/integration/auth-google.test.ts`, `auth-sliding-session.test.ts`, `auth-log-levels.test.ts`, `pool-delay.test.ts`, et `tests/e2e/private-dashboard.spec.ts`, `public-profile.spec.ts`, `administration-french.spec.ts`, `legacy-cookies.spec.ts`.
- Toutes les pages `/auth/**` partent avec `Cache-Control: private, no-store` et `X-Robots-Tag: noindex, nofollow` (`next.config.ts`).
- Le frein compte les échecs par adresse cliente : 10 par 15 minutes, le 11e est refusé (code `trop-de-tentatives` pour le formulaire, 429 pour `POST /api/pros/login`). Jamais par compte : le compte visé n'est pas verrouillé (`maxLoginAttempts: 0`). L'adresse est la dernière entrée de `X-Forwarded-For`, celle que le proxy a écrite ; si un autre relais de confiance se tient devant (CDN avec proxy actif), `TRUSTED_PROXY_CIDRS` (adresses ou plages séparées par des virgules) liste ses plages : elles sont sautées en lisant de droite à gauche. À renseigner avant la bascule si Cloudflare proxifie le domaine de l'application, sinon tous les visiteurs partagent une adresse ; une IPv6 compte par bloc /64. Les compteurs sont en mémoire, par processus : une seule instance de l'application. Aucune adresse n'est journalisée.
- **Le journal d'authentification** (`auth-events`, ticket 077) garde une ligne par connexion, réussie ou refusée : un type et une issue pris dans deux listes fermées (`src/lib/auth/auth-log.ts`), une durée en millisecondes et une date. Aucun champ de texte : ni adresse IP, ni email, ni nom, ni jeton n'y entrent, même glissés dans la saisie. Seul un admin le lit, aucune API ne l'écrit (l'admin non plus) : c'est le serveur, hors de la transaction de la connexion, si bien qu'une écriture qui échoue ne fait jamais échouer la connexion. Le formulaire écrit sa ligne dans `signInWithPassword`, la porte REST (`POST /api/pros/login`) dans les hooks de `pros` (`src/lib/auth/auth-log-payload.ts`) : jamais deux lignes pour une tentative. Le compte garde aussi la date de sa dernière connexion (`pros.lastSignInAt`).
- **Un compte de l'ancien site se connecte avec son mot de passe habituel** (tickets 087 et 088, `src/lib/auth/legacy.ts`). L'import copie le hash bcrypt de l'ancien site dans `pros.legacyBcrypt` (champ caché, qu'aucune API ne lit) et donne au compte un mot de passe Payload tiré au hasard. Quand Payload refuse la connexion du formulaire, `signInWithPassword` compare le mot de passe saisi à ce hash (`bcryptjs`) ; s'il correspond, le mot de passe est écrit au format de Payload, `legacyBcrypt` passe à `null` dans la même écriture, et la maquilleuse est connectée : le journal écrit le code `heritee`. Un mauvais mot de passe ne touche à rien. La porte REST native (`POST /api/pros/login`) ne connaît pas ce chemin : un compte hérité y reçoit un refus et passe par le formulaire. Un mot de passe choisi autrement (défini par un admin, lien de réinitialisation) efface ce hash (`legacy-hash-payload.ts`) : l'ancien mot de passe ne marche plus et ne remplace jamais le nouveau.
- **Un refus des identifiants prend le même temps** (ticket 088) : adresse inconnue, mauvais mot de passe, compte hérité, compte sans mot de passe font le même travail (une comparaison bcrypt, au hash du compte ou à un hash fictif ; pour une adresse inconnue, aussi le PBKDF2 que Payload fait pour un compte connu), même code et même message, et aucune réponse n'arrive avant 300 ms (`REFUSAL_FLOOR_MS`). La porte REST (`POST /api/pros/login`) fait de même par les hooks de `pros` (`src/lib/auth/equal-time-payload.ts`) : le travail de Payload pour une adresse sans compte, puis le plancher sur un refus. Une connexion réussie n'attend pas ; une saisie vide ou trop longue est refusée tout de suite, sans plancher (elle ne dit rien d'un compte). Le test de durée (U73) pilote une horloge simulée : aucune attente réelle. Un test (`tests/unit/legacy-sign-in.test.ts`) lit la source de Payload et échoue si ses paramètres PBKDF2 changent.
- **Les tâches quotidiennes** (`src/lib/tasks/`, ticket 077) : une liste de purges, `DAILY_TASKS`, lancée une fois par jour par le serveur de production (la première fois 5 minutes après le démarrage, jamais par un build, un script ni un test). La première purge supprime les lignes du journal de plus de 90 jours. La purge des messages de contact (ticket 162) supprime ceux reçus il y a plus de 12 mois de calendrier ; elle ne fait rien tant qu'un import tourne dans le même processus (`importEnCours`, `src/lib/import-context.ts`) et reprend le lendemain. Une tâche s'ajoute à la liste, reçoit l'horloge, est idempotente et ne compte que des lignes. Une seule instance de l'application les lance.
- Brique réutilisable : `createRateLimit({ nom, limite, fenetreMs })` (`src/lib/auth/rate-limit.ts`) avec `ipClient(headers)`. L'inscription, l'oubli de mot de passe, la recherche et le contact prennent chacun leur frein.
- **Le frein de la recherche** (ticket 100, `src/lib/search/rate-limit.ts`, joué par `src/proxy.ts` : une page ne peut pas répondre 429) : 60 requêtes par minute et par adresse sur `/search`, puis un 429 en français avec `Retry-After`. Aucune autre page n'est freinée (accueil, profils, blog : pages en cache). Un préchargement n'est pas compté, ni une requête qui n'est pas passée par le proxy : sans `X-Forwarded-For`, ou avec l'adresse de bouclage (`127.0.0.1`, `::1`) que Next y écrit quand personne ne l'a fait (développement, banc, essais de bout en bout). Comme celui de la connexion, il est en mémoire du processus.

### Inscription et confirmation

- **L'inscription** (`/auth/signup`, ticket 082) demande un nom (libre, il peut être celui d'une autre maquilleuse), un email, un mot de passe de 8 caractères au moins (aucune règle de composition) et les conditions générales cochées. Les règles sont dans `src/lib/auth/sign-up.ts`, jouées par la page et par le serveur, avec un message en français par champ.
- **Le compte, son profil vide et le mail partent ensemble**, dans une seule transaction (`src/lib/auth/sign-up-payload.ts`) : le compte, son profil et l'adresse du profil, que le serveur fait à partir du nom, puis le mail de confirmation par le point d'envoi unique (`src/lib/emails/`). Si le mail ne peut pas partir, rien n'est gardé : elle réessaie avec la même adresse. Une adresse déjà utilisée ne révèle rien (ticket 083, ci-dessous).
- **Le mur de vérification** (`/auth/verification-wall`) dit de regarder la boîte mail. **Le lien du mail** (`/auth/verification-complete?code=…`) confirme le compte : une fois. Le jeton est alors remplacé par la trace de son usage (un hachage), si bien que le même lien, suivi de nouveau, dit « déjà confirmé » et ne change rien ; un lien que personne ne connaît dit qu'il n'est pas valide (`src/lib/auth/confirmation.ts`). Un compte créé par un admin dans le panneau reçoit le même mail, avec le même lien.
- **Tant que l'email n'est pas confirmé, le compte ne se connecte pas.** Avec le bon mot de passe, la connexion le dit (code `email-non-confirme`) ; avec un mauvais mot de passe ou une adresse inconnue, elle répond comme toujours « Email ou mot de passe incorrect. », sans rien dire du compte.
- **Après le lien**, elle se connecte et arrive dans l'onboarding (`/auth/init-account`, ticket 140) : trois étapes (identité avec spécialité obligatoire, zone, photo principale), chacune enregistrée avant la suivante. L'étape affichée se lit dans le profil enregistré, donc une étape laissée se reprend. Un compte venu sans profil en reçoit un vide, créé par le serveur (`ensureProfile`). Une fois les trois étapes vues par le serveur, elle arrive dans `/auth/profil` ; un profil déjà actif y est envoyé directement. La question « Comment as-tu connu My Makeup ? » est posée mais n'est envoyée nulle part (l'événement `onboarding_source` est le ticket 148).
- L'interrupteur `AUTH_VERIFY` est décrit dans « Variables d'environnement ». Le schéma de `pros` ne change pas avec lui : `auth.verify` reste actif, et `off` crée le compte déjà confirmé.
- **Une adresse déjà utilisée ne révèle rien** (ticket 083). Avec la confirmation active, s'inscrire avec l'adresse d'un compte existant mène au même mur, aucun second compte ni profil n'est créé, et la vraie propriétaire reçoit un mail « Tu as déjà un compte My Makeup » (adresse enregistrée, jamais un lien de confirmation). La réponse part après un plancher de durée (`SIGN_UP_FLOOR_MS`, 1,5 s, appliqué en dernier) : une adresse neuve et une adresse prise répondent dans le même temps, à 50 ms près. Avec `AUTH_VERIFY=off`, un compte neuf entrerait aussitôt : la réponse honnête « Cette adresse email est déjà utilisée. » reste.
- **Le renvoi de la confirmation** (mur de vérification, `src/lib/auth/resend.ts`) : un champ email, une réponse identique pour un compte en attente, un compte confirmé et une adresse inconnue. Un mail par minute et 5 par jour pour une boîte (la forme canonique de l'adresse, voir plus bas : les variantes Gmail comptent pour une), plus 10 demandes par heure et par adresse cliente. Un compte en attente reçoit son lien de confirmation, le même ; un compte confirmé reçoit « tu as déjà un compte » ; une adresse inconnue ne reçoit rien. Les freins sont dans `src/lib/auth/sign-up-rate-limits.ts`, en mémoire comme les autres.
- **Contre les faux comptes** (ticket 084) : 5 inscriptions par heure et par adresse cliente : la sixième est arrêtée par le proxy, qui l'envoie à `src/app/(front)/(dashboard)/auth/signup/throttled/route.ts`, laquelle répond un vrai 429 avec `Retry-After` et la phrase en français (le formulaire la montre sous ses champs) ; le refus est écrit au journal, au plus 3 lignes par heure pour une adresse et un motif ; un champ piège (`commentaire`, hors de vue, hors du clavier, caché des lecteurs d'écran) dont le remplissage donne l'écran de réussite sans créer de compte ni envoyer de mail ; les variantes Gmail (points, `+étiquette`, `googlemail.com`) sont une seule boîte (`src/lib/auth/canonical-email.ts`, `src/lib/auth/account-by-email.ts`) et se traitent comme « déjà pris » ; et une purge quotidienne (`src/lib/tasks/unconfirmed-accounts.ts`) supprime au bout de 7 jours les comptes jamais confirmés et leur profil vide, jamais un compte importé (`strapiId` ou `legacyProvider` renseigné) ni un profil rempli. Les refus laissent une ligne au journal avec leur motif (`champ-piege`, `trop-de-tentatives`, `email-deja-pris`), sans adresse IP ni email. L'inscription d'une adresse neuve prend, comme le mail « tu as déjà un compte » d'une adresse prise, une place dans le frein par boîte (1 par minute, 5 par jour) : un renvoi demandé juste après répond pareil dans les deux cas. Un compte pas encore confirmé qui s'inscrit de nouveau reçoit son lien de confirmation, pas « connecte-toi ». Ticket 224 : seule l'erreur d'unicité de Payload (ses deux phrases, en français et en anglais) vaut « adresse déjà utilisée » ; une autre erreur de Payload sur l'email (sa forme) répond `email-invalide`, avec la phrase du champ sous le champ (`SIGN_UP_MESSAGES.email.invalide`) et le motif `donnees-invalides` au journal.

### Mot de passe oublié

Deux pages, aux chemins de l'ancien site : `/auth/mot-de-passe-oublie` (l'adresse) et `/auth/reinitialiser` (le nouveau mot de passe). Le lien « Mot de passe oublié ? » est sur la page de connexion, toujours visible.

- Payload fabrique le jeton (`pros.auth.forgotPassword`, une heure) mais n'envoie pas le mail : il part par le point d'envoi unique du site (`payloadSendEmail`), texte et HTML, avec le contenu de `src/lib/emails/password-reset.ts`. Comme Payload coupe son délai de 15 secondes par compte quand son envoi est coupé, la demande le garde elle-même (une écriture atomique sur `resetPasswordRequestedAt`) ; si le mail ne part pas, la place est rendue. Le lien vaut une heure et ne sert qu'une fois : deux envois du même lien au même instant, un seul passe (le lien est réclamé dans la transaction, la ligne verrouillée).
- La demande répond la même phrase, dans le même temps (plancher de 300 ms), pour une adresse qui a un compte et pour une adresse qui n'en a pas : le travail et l'envoi se font après la réponse (`after` de Next). Elle est freinée par adresse cliente (10 par 15 minutes, chaque demande compte). Les portes REST natives de Payload (`/api/pros/forgot-password`, `/api/pros/reset-password`) répondent 403.
- Le code du lien ne reste pas dans l'adresse : `src/proxy.ts` répond une redirection vers `/auth/reinitialiser` et le garde dans le cookie `mm-reset` (HttpOnly, propre à cette page, une heure). La page dit « Ce lien n'est plus valable » pour un lien périmé, déjà servi ou venu de l'ancien site.
- Choisir un nouveau mot de passe, en une transaction : nouveau hash, toutes les sessions du compte fermées, hash de l'ancien site effacé, jeton effacé. La maquilleuse se connecte ensuite avec son nouveau mot de passe.
- Le journal (`auth-events`) a les types `forgot-password` et `password-reset`.
- Les comptes sans mot de passe passent par la même porte (ticket 093) : une ancienne inscrite Google ou Facebook demande un lien avec son adresse, reçoit le même mail, choisit son mot de passe et se connecte avec, sur le même compte et le même profil. Google marche toujours ensuite. Avant cela, la connexion par mot de passe de ce compte répond le message commun. Il n'y a aucun bouton Facebook : une ligne d'aide (`PasswordlessHelp`), affichée à tout le monde sur la page de connexion, dit aux anciennes inscrites Facebook de passer par « Mot de passe oublié ».

### Créer un compte admin

L'écran « créer le premier compte » de l'administration est fermé (`POST /api/admins/first-register` répond 403, même sur une base vide). Tant qu'aucun admin n'existe, et pour chaque nouveau compte, on passe par la commande ; une fois connecté, un `admin` peut aussi créer des comptes `admin` ou `editor` dans l'administration (le rôle par défaut est `editor`) :

```sh
bun run admin:create <email>                    # un admin, sur la base de DATABASE_URI
bun run admin:create <email> --role=editor   # un compte rédaction
bun run admin:create <email> --remote-target   # quand DATABASE_URI n'est pas sur ce poste
```

Le script porte `--no-env-file` (ticket 233) : il ne lit jamais le `.env` de travail, pour qu'un `.env` qui nommerait une autre base ne l'y envoie pas sans qu'on le voie. `DATABASE_URI` et `PAYLOAD_SECRET` viennent de l'environnement du terminal : en local, `set -a; . ./.env; set +a` (shell POSIX) les y met avant la commande.

- **Le mot de passe se tape au clavier, deux fois, sans s'afficher.** Il n'existe aucune option, aucune variable d'environnement ni aucun tube pour le donner : hors d'un terminal, la commande refuse. Douze caractères au moins, aucune règle de composition. Elle n'affiche que l'identifiant et le rôle du compte créé, jamais l'adresse ni le mot de passe.
- **Elle écrit par l'API locale** dans la base de `DATABASE_URI`, sans toucher au schéma : les tables sont celles que l'application a créées. Une base qui n'est pas sur ce poste est refusée sauf `--remote-target`, avant tout chargement. Elle refuse une adresse qui a déjà un compte, et deux saisies différentes.
- **Aucun compte admin de l'ancien site n'est importé** : les trois comptes de l'ancien Strapi ne sont pas repris, ils se recréent ici. Le rôle `admin` est celui du propriétaire ; `editor` sert aux comptes qui n'écrivent que des articles et des talents.
- **Quand la base n'est pas publique** (production, ticket 185), l'image déployée ne contient ni `bun` ni `scripts/` : la commande ne peut pas s'y lancer. Elle se lance depuis un poste, par une ouverture **temporaire** de la base : dans Coolify, ressource de la base, « Make it publicly available » sur un port, ou un tunnel vers elle. Dans l'ordre : ouvrir, lancer `DATABASE_URI=… bun run admin:create <email> --remote-target` (la variable posée sur cette seule ligne, jamais dans un fichier), puis **refermer l'ouverture aussitôt**. La base est sensible : ne jamais laisser le port ouvert, et le pare-feu du serveur reste la seule autre barrière. Aucun accès SSH n'est configuré. Le ticket 185 reprend cette procédure pour la production.

- **Mot de passe admin oublié (ticket 272).** Les portes REST `POST /api/admins/forgot-password` et `/api/admins/reset-password` sont **fermées** (403, comme pour `pros`) : aucun email ne part, quelle que soit l'adresse, et une adresse admin connue ne peut pas vider le quota d'envoi. Le lien « mot de passe oublié » de l'écran de connexion de l'administration ne marche donc plus. Pour remplacer un mot de passe perdu : un autre `admin` ouvre le compte dans l'administration et en saisit un nouveau ; s'il n'y a pas d'autre admin, on crée un nouveau compte par `bun run admin:create <autre adresse>` (même procédure, base non publique comprise), on s'y connecte, puis on supprime l'ancien compte. Chaque demande refusée laisse une ligne dans le journal `auth-events` (type et code, jamais l'adresse).
- **Cookie de session** : `Secure`, `HttpOnly` et `SameSite=Lax` en production, 8 heures (comme le cookie des maquilleuses).

Les tests : `tests/unit/create-admin.test.ts` (les règles et la commande), `tests/integration/admins-roles.test.ts` (l'écran du premier compte fermé, le frein), `tests/integration/payload-locks.test.ts` et la matrice d'accès (les verrous), et `tests/e2e/admin-refuse-artist.spec.ts` (E54 : une maquilleuse connectée n'ouvre pas `/admin`, et les verrous marchent pour les comptes du panneau).

### Accès

- GraphQL est coupé : `/api/graphql` et `/api/graphql-playground` répondent 404.
- Un cookie de session n'est accepté que depuis une origine de confiance. En production, c'est l'adresse de `NEXT_PUBLIC_SITE_URL` et elle seule. Ailleurs, c'est ce poste : `localhost` et `127.0.0.1`, sur le port du serveur.
- Un client qui n'est pas un navigateur (`curl`, un test) doit envoyer l'en-tête `Origin` d'une origine de confiance avec son cookie de session. Sans cet en-tête, le cookie est ignoré.
- Dans un navigateur, une page ouverte depuis un autre site (un lien dans un webmail, un résultat de recherche) arrive sans en-tête `Origin` et avec `Sec-Fetch-Site: cross-site` : le cookie de session est ignoré pour cette page, et la personne y paraît déconnectée. Une adresse tapée, un favori et un lien du site lui-même ne sont pas concernés. Une page privée de l'espace (`/auth/profil`) traite cette personne comme n'ayant pas de session : une redirection vers `/auth/signin?callbackUrl=…`, où elle se reconnecte une fois (ticket 075).
- Aucun autre site ne peut lire l'API depuis un navigateur : aucune origine n'est ouverte en CORS.
- `/api/og`, l'image de partage de l'administration, est fermée.
- Deux rôles ouvrent l'administration : `admin` peut tout ; `editor` ne lit et ne modifie que son propre compte, sans pouvoir changer son rôle. Une session de l'administration dure 8 heures. Aucun visiteur ne crée de compte de l'administration : l'écran du premier compte (`POST /api/admins/first-register`) répond 403, sur une base vide comme sur une base pleine, et pour une maquilleuse connectée comme pour un visiteur. Le premier compte se crée par `bun run admin:create` (voir « Créer un compte admin »), jamais importés de l'ancien site. La connexion de l'administration (`POST /api/admins/login`) a le même frein par adresse que celle des maquilleuses ; comme pour les maquilleuses, le compte n'est jamais verrouillé (`maxLoginAttempts: 0`), pour qu'on ne puisse pas enfermer dehors le propriétaire en frappant à son adresse.
- Les verrous d'édition de Payload (collection interne `payload-locked-documents`) sont réservés aux comptes `admin` et `editor` : une maquilleuse et un visiteur reçoivent 403 en lecture, en pose, en changement et en retrait. Un verrou porte toujours le compte de la session, quel que soit le `user` du corps de la requête : la reprise en main d'un document par un second compte du panneau passe par là. Les règles sont posées au démarrage (`src/lib/payload-locks.ts`).
- Le panneau d'administration de la rédaction (ticket 164) : un compte `editor` n'y voit que les articles, les talents et les médias (leurs images). Les messages de contact, le journal d'authentification, les comptes, les profils et les maquilleuses sont masqués du menu pour tout autre rôle que `admin` (`hiddenExceptAdmin`, `src/lib/access.ts`), et leur adresse directe n'ouvre rien ; ce que le compte lit ou écrit par l'API reste dit par les règles d'accès de chaque collection (matrice d'accès). Un compte `editor` publie et dépublie un article ou un talent : la page publique suit tout de suite, un document dépublié répond 404. Il ouvre son propre compte par l'adresse `/admin/account`, sans pouvoir changer son rôle. Tests : `tests/unit/access.test.ts` (U59) et `tests/e2e/admin-editor.spec.ts` (E55).
- Une maquilleuse (collection `pros`) n'entre jamais dans l'administration. Elle ne lit et ne modifie que son propre compte, sans pouvoir changer ses champs réservés (bloqué, vérifié, fournisseur d'origine, identifiant de l'ancien site). Aucun anonyme ne crée de compte par l'API REST, même sur une base vide. Le mot de passe, le hash hérité de l'ancien site et les sessions ne sortent jamais, pas même pour un admin : Payload rend la liste des sessions toujours vide. L'email d'un compte est rangé en minuscules : deux adresses qui ne diffèrent que par la casse sont le même compte.
- Créer le compte d'une maquilleuse crée son profil vide (collection `profiles`), avec un slug unique calculé par le serveur à partir du nom du compte (`src/lib/slug.ts`) : `-2`, `-3` pour les homonymes, `maquilleuse-<identifiant>` pour un nom qui ne donne rien. Le slug ne change plus ensuite, et aucune API ne l'écrit. Une création qui porte `NO_PROFILE_CONTEXT` (`src/collections/Profiles.ts`) laisse le compte sans profil : c'est ce que fera l'import pour les comptes qui n'en ont pas. Une maquilleuse ne modifie que son propre profil ; un compte sans profil ne modifie rien. Par l'API locale, un compte qui a encore un profil n'est pas supprimé (refus 409) : le profil part d'abord. Un admin qui supprime un compte (`DELETE /api/pros/:id`, ticket 167) supprime tout d'un bloc : le profil, le compte, ses sessions, et ses photos vont à la corbeille du stockage (`src/lib/account/deletion.ts`).
- Un profil a un statut : `draft` (celui d'un profil neuf), `published` ou `hidden`. L'anonyme et le rôle `editor` ne lisent que les profils publiés ; une maquilleuse lit le sien, quel que soit son statut, et les profils publiés. Le serveur calcule lui-même le statut : brouillon pour un profil entièrement vide, publié sinon, à moins qu'un admin n'en ait choisi un autre (voir « État d'un profil »). Ce que lit le public d'un profil est son identité et le badge « Super maquilleuse », jamais le compte relié, ni ce qu'a écrit l'import (`strapiId`, `legacyUsername`), ni ce qu'a décidé un admin. Seul un admin écrit le choix du statut, le motif, la vérification et sa date, le SIRET, la note interne, le score et le badge : ce qu'une maquilleuse envoie sur ces champs est ignoré. Elle lit son statut, son motif, sa vérification et son SIRET, jamais la note interne ni le score.
- Les réseaux d'un profil sont publics. Ses coordonnées (`contactDetails` : téléphone et email de contact) ne sont lues que par la propriétaire et un admin, jamais par le public ni par le rôle `editor`, même quand elle a choisi de les montrer (`publicContact`) : une page publique les lira par `src/services/public/`. Quand `publicContact` devient vrai, le serveur pose lui-même la date (`consentedAt`) et la source du consentement (`consentSource` : `artist` ou `admin`, selon le compte qui enregistre) ; il les vide quand il redevient faux. Aucune API ne les écrit. Un téléphone de plus de 20 caractères ou un email mal formé est refusé, avec le message de l'ancien site. Un lien de réseau qui nomme un protocole autre que `http` ou `https` (`javascript:`, `data:`) est refusé : la page publique en fera un lien.
- Les photos (collection `media`) sont des objets du stockage, chacun sous son propre préfixe. Le public ne liste jamais les médias : il lit un média seulement s'il est la photo principale ou une photo de la galerie d'un profil publié ; un autre est introuvable (404). Une maquilleuse envoie ses photos, liste et lit les siennes, ne modifie et ne supprime que les siennes ; le serveur la pose comme propriétaire (`owner`), quel que soit le propriétaire que dit sa requête, et ce que dit une requête sur l'objet lui-même (nom, préfixe, adresse, type, taille) est ignoré. Un profil n'accepte que des photos de son compte : une photo principale et une galerie ordonnée de 10 photos au plus. Le propriétaire, l'identifiant et les formats de l'ancien site ne sont pas publics. Un document demandé par un identifiant qu'aucun document ne peut porter (`/api/media/abc`, `/api/pros/99999999999`) est refusé (403) avant toute requête à la base, dans toutes les collections.
- Les talents (collection `talents`, les pages `/talent/<slug>`) sont écrits par la rédaction, c'est-à-dire les rôles `admin` et `editor` : créer, modifier, publier, dépublier, supprimer, lire les brouillons et les versions. Tout autre visiteur, maquilleuse connectée comprise, ne lit que les talents publiés, même en demandant les brouillons (`?draft=true`), et n'écrit rien. Deux talents n'ont jamais le même slug ; un slug s'écrit déjà comme une adresse (minuscules sans accent, mots séparés par un tiret), sinon il est refusé à la publication, jamais corrigé. L'identifiant de l'ancien site (`strapiId`) n'est écrit que par l'import et ne sort que pour la rédaction. Ces règles de la rédaction sont dans `src/collections/editor.ts`, pour les articles aussi.
- Les articles du blog (collection `articles`, les pages `/blog/<slug>`) suivent les mêmes règles que les talents : la rédaction les écrit, les publie et les dépublie ; tout autre visiteur ne lit que les articles publiés. Les champs sont ceux de l'ancien site (titre, adresse, auteur, extrait, titre et description pour les moteurs de recherche, 70 et 155 caractères au plus), sauf la galerie, `gallery`. Le contenu est du markdown, sans limite de longueur, relu à l'identique. La galerie ne prend que des images de la rédaction (JPEG, PNG, WebP, GIF ou AVIF), brouillon compris : un PDF, la photo d'une maquilleuse ou un identifiant qu'aucun média ne peut porter y sont refusés (400), pour la rédaction, un admin comme pour l'import. Ses photos n'appartiennent à personne : la rédaction les envoie, les liste, les modifie et les supprime, sans jamais toucher à une photo de maquilleuse. Le public lit une photo d'article quand elle est dans la galerie d'un article publié et n'appartient à personne ; celle d'un brouillon reste introuvable, y compris quand un brouillon l'ajoute à un article déjà publié, jusqu'à sa publication.
- Toute requête est bornée avant la base (`src/lib/bounded-query.ts`), dans chaque collection, celles que Payload ajoute lui-même comprises (verrous des documents, préférences) : un filtre de plus de 20 conditions, ou un filtre ou un tri sur l'email d'un compte, les coordonnées, la note interne ou le score d'un profil, est refusé (400) à tout autre qu'un admin, même par une relation (`pro.email`). Les secrets d'un compte (mot de passe, sel, sessions, hash hérité, jetons) ne servent jamais de filtre ni de tri, pas même à un admin. La réponse est la même phrase en français, que la valeur existe ou non. Payload refuse de lui-même un filtre ou un tri sur tout autre champ que la personne ne peut pas lire. Le code du serveur qui lit sans les règles (`overrideAccess`) n'est pas borné. Une lecture en liste par l'API REST est plafonnée pour tout compte autre que `admin` (ticket 071, défaut en attente de la parole d'Andy) : 100 documents au plus, 10 sans `limit`, `pagination=false` ignoré ; le plafond est posé par un endpoint `GET /` en tête de chaque collection, pas par l'API locale (pages, sitemap, relations).
- Les règles sont dans `src/lib/access.ts`. Chacune a ses lignes dans la matrice d'accès, jouée par l'API REST et par l'API locale (`tests/integration/payload-access.test.ts`, voir [`docs/tests/banc.md`](docs/tests/banc.md), « La matrice d'accès »).

### En-têtes de sécurité

Chaque réponse du site part avec cinq en-têtes, sur toutes les adresses : pages, API, administration, fichiers, erreurs. Une seule sorte de réponse en est privée : la redirection 308 par laquelle Next répond lui-même à une adresse avec `//` (`//blog`), avant que le proxy ne la lise. Les autres redirections, celle du `/` final comprise, passent par le proxy et portent les cinq en-têtes (relevé du 16/10/2026, ticket 228).

| En-tête | Valeur | Effet |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000` | Pendant un an, le navigateur ne demande plus le site qu'en https. Ce domaine seulement : ni `includeSubDomains`, ni `preload`. Sans effet sur une adresse en http, donc sur ce poste. |
| `X-Content-Type-Options` | `nosniff` | Un fichier est lu selon le type que le serveur annonce, jamais selon son contenu. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Un autre site apprend de quel site vient la visite, sans le chemin ni les paramètres. |
| `Permissions-Policy` | caméra, micro, position, paiement et USB coupés | Le site ne s'en sert pas : ni une page ni un cadre inclus ne peut les demander. |
| `Content-Security-Policy-Report-Only` | la politique de contenu | En mode rapport : voir ci-dessous. |

- Aucune réponse ne porte d'en-tête `X-Powered-By`, mais Next ajoute encore ses en-têtes `x-nextjs-*` (`x-nextjs-cache`, `x-nextjs-prerender`, `x-nextjs-stale-time`) aux pages prérendues, aux fichiers de `robots.txt` et à l'optimiseur d'images : ils nomment Next. Les retirer est une décision de sécurité qui reste à Andy ; aucun test ne les interdit (relevé du 16/10/2026, ticket 228).
- La politique de contenu est en mode rapport. Le navigateur écrit dans sa console ce qu'elle refuserait, et ne bloque rien. Aucun rapport n'est envoyé, ni au site ni ailleurs.
- Elle ne nomme qu'une origine extérieure : celle des photos. La mesure passe par le site lui-même : aucun domaine tiers n'y figure pour elle, et il ne faut pas en ajouter.
- Elle autorise les scripts écrits dans la page : Next en a besoin pour les pages rendues d'avance. `bun run dev` autorise en plus `eval`, dont React a besoin en développement.
- Les valeurs sont dans `src/lib/security-headers.ts`, et `next.config.ts` les pose sur `/:path*`. Un en-tête propre à certaines adresses s'ajoute dans `next.config.ts`, après cette entrée.

### Images

- `/_next/image` ne va chercher une image distante que sur l'hôte des photos, en https. Toute autre adresse reçoit une erreur 400, sans qu'aucune requête ne parte.
- L'hôte des photos est celui de `R2_PUBLIC_URL`. Sans cette variable, c'est celui des photos du site en ligne.
- Cet hôte est aussi le seul que nomme la politique de contenu.
- `R2_PUBLIC_URL` se donne au build et à `bun run start`, avec la même valeur : la politique de contenu garde l'hôte du build, et `/_next/image` relit la variable au démarrage.
- Dans l'image Docker, c'est un argument de build (`--build-arg R2_PUBLIC_URL=…`). Dans Coolify, la variable doit être cochée « Build Variable » **en plus** de l'être pour l'exécution : sinon l'image porte la règle du site en ligne, et le navigateur comme l'optimiseur refusent les photos d'un autre compartiment. Vide, l'argument est ignoré : ce sont les photos du site en ligne.
- Une image servie par `/_next/image` porte en plus la politique de Next pour les images, appliquée celle-là : ni script, ni cadre.

```sh
curl -sI http://localhost:3000/ | grep -i -E 'strict-transport|x-content-type|referrer-policy|permissions-policy|content-security|x-powered'
bun --no-env-file test tests/unit/security-headers.test.ts
```

## Route de santé

`GET /api/health` dit si l'application peut servir. C'est l'adresse que lisent Coolify, le contrôle de santé de l'image et la surveillance du site. Le chemin et les clés sont ceux du site en ligne.

| Cas | Réponse |
|---|---|
| La base répond | `200` et `{"ok":true,"version":"…"}` |
| La base ne répond pas dans les 2 secondes | `503` et `{"ok":false}`, sans aucun détail |

- La question est posée à la base à chaque appel, par la connexion de Payload. La réponse n'est jamais mise en cache (`Cache-Control: no-store`) ni indexée (`X-Robots-Tag: noindex`).
- La cause d'un 503 n'est écrite que dans les journaux du serveur, sur une ligne `[health] check failed: …` qui se termine par un code : `ECONNREFUSED` (base arrêtée), `timeout` (pas de réponse en 2 secondes), `PAYLOAD_INIT` (Payload n'a pas démarré).
- Sans base, la route répond 503 : Payload ne démarre pas. Sans une variable obligatoire, la route ne répond pas du tout : l'application refuse de démarrer (voir « Configuration durcie »).
- Au premier appel après un démarrage, la route attend Payload. S'il lui faut plus de 2 secondes (par exemple pendant la poussée du schéma en développement), elle répond 503 cette fois-là, puis 200 dès qu'il est prêt.

`version` est le commit déployé, réduit à ses 7 premiers caractères. Il est cherché dans cet ordre :

1. `NEXT_PUBLIC_APP_VERSION`, lue au build : un libellé est affiché tel quel, un commit complet (40 caractères) est raccourci ;
2. `SOURCE_COMMIT` donné au build (dans Coolify : « Include Source Commit in Build ») ;
3. `SOURCE_COMMIT` donné au conteneur qui tourne, si le build n'en avait pas ;
4. la version de `package.json`.

En local, sans ces variables, `version` est donc la version de `package.json`.

```sh
curl -i http://localhost:3000/api/health
bun --no-env-file test tests/unit/health.test.ts tests/unit/version.test.ts
```

## Image Docker

Le `Dockerfile` construit l'image que l'hébergeur déploie : le serveur autonome de Next.js (`output: 'standalone'`) sur Node 24, sans bun, sans sources et sans dépendances de développement.

L'image lance ce serveur autonome (`node server.js`). Sur ton poste, `bun run start` sert le même build avec `next start` : Next affiche alors « "next start" does not work with "output: standalone" configuration ». Cet avertissement est attendu : le site est servi normalement. `bun run start` reste la commande de ton poste, avec ses options `-p` et `-H`.

```sh
bun run image:build      # construit l'image my-makeup:local
bun run image:check   # la démarre contre une base jetable et vérifie le tableau ci-dessous
```

| Ce que l'image garantit | Comment |
|---|---|
| Elle se construit sans base ni secret | Le build ne reçoit que des variables publiques (liste ci-dessous). Les noms des variables d'exécution n'apparaissent ni dans l'historique de l'image ni dans sa configuration. |
| Elle tourne sans droits d'administration | Le serveur tourne sous l'utilisateur `node` (uid 1000), jamais `root`. |
| Elle joue les migrations une fois | Sur une base vide, le premier appel reçu démarre Payload, qui joue les migrations de `src/migrations/`. Aux démarrages suivants, rien n'est rejoué. |
| Elle dit si elle est saine | Son contrôle de santé interroge `/api/health` toutes les 30 secondes : « healthy » quand la base répond, « unhealthy » après 3 échecs de suite. Pendant les 60 premières secondes, un échec ne compte pas. |
| Elle redimensionne les images | `sharp` est dans l'image : `/_next/image` rend une image à la largeur demandée. |

### Variables

| Variable | Donnée | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Au build (`--build-arg`, « Build Variable » dans Coolify) | L'adresse du site, figée dans le build. Une image construite sans elle est une image de test : le conteneur doit alors la recevoir au démarrage. |
| `SOURCE_COMMIT` | Au build | Le commit construit : c'est la `version` de `/api/health`. |
| `R2_PUBLIC_URL` | Au build (`--build-arg`, « Build Variable » dans Coolify) **et** au conteneur, avec la même valeur | L'adresse publique des photos : elle fixe les hôtes que l'optimiseur d'images accepte et la politique de contenu (voir « Images »). Absente, ce sont les photos du site en ligne. |
| `NEXT_PUBLIC_APP_VERSION` | Au build, facultative | Un libellé de version, à la place du commit. |
| `DATABASE_URI`, `PAYLOAD_SECRET`, `S3_*` | Au conteneur seulement | Jamais au build : dans Coolify, la case « Build Variable » reste décochée. |

- Une nouvelle variable publique de build s'ajoute à trois endroits : une ligne `ARG` du `Dockerfile`, la liste de `scripts/image/rules.ts`, et `.env.exemple`.
- Une nouvelle variable d'exécution ne s'ajoute qu'à `.env.exemple` (et à `src/lib/env.ts`). La garde de `tests/ci/` refuse alors tout `Dockerfile` qui la nomme, et `bun run image:check` toute image qui la porte.
- `.dockerignore` refuse tout, puis laisse passer ce dont le build a besoin. Un `.env` local, un dump de `.migration/` ou l'historique git n'atteignent jamais le build. La liste est figée par un test de `tests/ci/`.
- Les versions de Node et de bun du `Dockerfile` sont celles de `.nvmrc` et de `packageManager`, chaque image étant figée par son digest. La garde C04 de `tests/ci/` échoue si l'une d'elles s'écarte.

### Le contrôle de l'image

`bun run image:check [image]` a besoin de la commande `docker`, et de rien d'autre. Il crée un réseau, une base PostgreSQL en mémoire sans port publié, démarre l'image deux fois, puis arrête la base. Il supprime tout à la fin, même en cas d'échec. Il ne lit aucun fichier `.env`.

| Variable | Effet |
|---|---|
| `IMAGE_CHECK_NAME` | Préfixe des conteneurs et du réseau (défaut : `mm-controle-image`). À changer pour lancer deux contrôles en même temps. |
| `IMAGE_CHECK_PORT` | Port de l'application sur `127.0.0.1` (défaut : un port libre). |
| `IMAGE_CHECK_COMMIT` | Le commit donné au build en `SOURCE_COMMIT` : la `version` de `/api/health` doit en être les 7 premiers caractères. |
| `IMAGE_CHECK_PHOTOS` | Le `R2_PUBLIC_URL` donné au build (défaut : aucun, donc les photos du site en ligne) : la politique de contenu doit nommer cet hôte et lui seul, et l'optimiseur doit refuser l'autre. |

Pour rendre son verdict vite, le contrôle demande au moteur de jouer le contrôle de santé de l'image toutes les 2 secondes. Podman refuse ce réglage : le contrôle suit alors le rythme de l'image, et dure un peu plus de 2 minutes.

Avec Podman, l'image se construit au format Docker, sinon Podman retire le contrôle de santé :

```sh
podman build --format docker --tag my-makeup:local .
DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock bun run image:check
```

## Intégration continue

Chaque pull request et chaque poussée sur `v3` lancent `.github/workflows/ci.yml` : cinq jobs en parallèle, puis `ci-ok`, le seul check à exiger pour fusionner.

| Job | Ce qu'il lance |
|---|---|
| `qualite` | Fichiers générés par Payload à jour, `bun run typecheck`, `bun run ci:biome`, `bun run test:ci-guard` |
| `unit` | `bun run test:unit` |
| `build` | `bun run image:build` sans secret ni base, puis `bun run image:check` |
| `integration` | En trois lots côte à côte : `bun run bench:up`, puis `bun run test:integration --shard=N/3` sur un tiers des fichiers : le banc de test, en CI comme sur un poste |
| `e2e` | En quatre lots côte à côte : le Chromium de Playwright, `bun run bench:up`, puis `bun run test:e2e --shard=N/4` sur un quart des essais |
| `ci-ok` | Rouge si l'un des cinq a échoué, a été annulé ou a été sauté |

Avant de pousser, les mêmes commandes se lancent en local : `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:ci-guard`, et, banc démarré, `bun run test:integration` et `bun run test:e2e`.

La CI ne lit aucun secret, n'a aucun filtre de chemins et ne tolère aucun échec. Ces règles sont tenues par les garde-fous de `tests/ci/` : voir [`docs/qualite.md`](docs/qualite.md), qui dit aussi comment ajouter un job ou une action.

## Mises à jour des dépendances

`renovate.json` porte les règles que Renovate suivra pour proposer les nouvelles versions : versions exactes, 7 jours d'attente, majeures sur approbation, et une fusion automatique réservée aux petites mises à jour, derrière le check requis `ci-ok`. Payload, Next, Biome et Playwright ne sont jamais fusionnés seuls.

- **Ces règles n'ont aucun effet avant la bascule.** Renovate ne lit que le `renovate.json` de la branche par défaut : tant que `main` porte l'ancien site, c'est le sien qui s'applique, en sécurité seule.
- Une garde de `tests/ci/` fige les règles, et `bun run renovate:validate` demande à Renovate s'il sait lire le fichier.

Le détail est dans [`docs/qualite.md`](docs/qualite.md), « Renovate » : ce que chaque règle décide, comment en changer une, et ce qui doit être réglé sur `main` avant la bascule.

## Notes de version et publication

Un changement qu'une visiteuse ou une maquilleuse peut remarquer a sa note de version, ajoutée dans le même commit : `bun run notes:add ajout "Tu peux ajouter une vidéo à ta galerie."`. Elle attend dans `src/content/changelog.json`.

Quand la CI d'une poussée sur `main` est verte, `ci-ok` compris, le workflow `.github/workflows/release.yml` réserve le numéro suivant (`3.0.0`, puis `3.0.1`…), range les notes en attente dessous et pousse `.release/version.json` avec l'étiquette du numéro. Coolify surveille ce fichier pour déployer la prod. Personne ne publie à la main ; `bun run release:publish --dry-run` montre ce que ferait la prochaine publication, sans rien écrire.

Rien ne se publie avant la fusion de `v3` dans `main`. Le détail, et ce qu'il reste à régler dans GitHub et Coolify : [`docs/publication.md`](docs/publication.md).

## Commandes

| Commande | Rôle |
|---|---|
| `bun run dev` | Serveur de développement, sur `127.0.0.1` seulement |
| `bun run build` | Build de production |
| `bun run start` | Sert le build de production avec `next start`. L'avertissement de Next sur `output: standalone` est attendu (voir « Image Docker ») |
| `bun run check` | Biome : format, lint et tri des imports, avec écriture des corrections sûres |
| `bun run lint` | Biome : lint seul, sans écriture |
| `bun run ci:biome` | Biome en lecture seule, pour la CI |
| `bun run ci:canary` | Écrit les quatre fautes du canari de la CI, sur une branche `canari-…` seulement (voir `docs/qualite.md`) |
| `bun run renovate:validate` | Fait valider `renovate.json` par Renovate, en mode strict. Il lui faut `docker` (voir `docs/qualite.md`, « Renovate ») |
| `bun run typecheck` | Génère les types de routes de Next, puis contrôle les types (`tsc --noEmit`) |
| `bun run payload:types` | Régénère `src/payload-types.ts` après un changement de collection |
| `bun run payload:importmap` | Régénère `importMap.js` après l'ajout d'un composant d'administration |
| `bun run payload:migrate` | Joue les migrations de `src/migrations/` qui ne l'ont pas encore été |
| `bun run payload:migrate:create` | Écrit une migration à partir des collections, à relire avant de la versionner |
| `bun run schema:drift` | Dit si les collections du code et la dernière migration décrivent le même schéma, sans base ni secret (voir `docs/qualite.md`, « La dérive de schéma ») |
| `bun run payload` | Le CLI de Payload |
| `bun run test` | Les tests qui tournent sans le banc de test : les tests unitaires |
| `bun run test:unit` | Les tests unitaires de `tests/unit/`, sans lire le fichier `.env` |
| `bun run test:ci-guard` | Les garde-fous de `tests/ci/`, lancés à part de `bun run test` |
| `bun run bench:up` | Démarre le banc de test : base, capteur de mails, stockage d'objets, faux Google et faux Umami, en conteneurs |
| `bun run bench:down` | Arrête le banc de test et efface tout ce qu'il contenait |
| `bun run bench:full` | Le banc complet en une commande : démarre la pile, la remet à son état de départ (base reconstruite par les migrations, comptes types, 12 profils types avec photos, 3 talents, 3 articles dont un brouillon), construit l'application et la lance sur le port du banc. `--without-application` s'arrête avant l'application (voir « Le banc de test ») |
| `bun run bench:reset` | Remet le banc à son état de départ, application ou non : base, stockage, capteur de mails, jeu. Environ 10 secondes |
| `bun run bench:session <compte>` | Ouvre la session d'un compte du banc (`admin`, `redaction`, `maquilleuse`, `profil-reference`… ou une adresse) et l'écrit dans `.banc/sessions/`, sans jamais afficher le jeton |
| `bun run bench:prepare` | Reconstruit la base du banc par les migrations versionnées, vide, puis vérifie qu'elle décrit les collections du code |
| `bun run bench:source` | Crée la fausse base Strapi que lit l'import, banc démarré : base, rôle en lecture seule, photos dans le stockage. Relancée, elle la recrée à l'identique et donne la même empreinte. `--fingerprint` la lit sans la toucher, `--erase` la supprime (voir `docs/tests/source-strapi.md`) |
| `bun run bench:import` | L'import des données de l'ancien site sur le banc : il lit la fausse base Strapi et écrit dans la base du banc. À blanc par défaut, `--real` pour écrire (voir `docs/migration/IMPORT.md`) |
| `bun run bench:reconcile [--json] [--outside-import]` | Le rapprochement à blanc du stockage et de la base du banc : objets sans média, médias sans objet, médias sans profil, avec la corbeille comptée à part. Ne supprime rien (aucune option ne le permet) ; code de sortie 1 s'il trouve un orphelin. La CI le lance après les essais de bout en bout (voir `docs/tests/banc.md`, « Le rapprochement du stockage et de la base »). |
| `bun run rehearsal --dump <sauvegarde> --decisions <fichier> --cities <fichier> --consent-date <date>` | La répétition complète de la migration en une commande, sur un banc à elle (`mm-rehearsal`) : restaure hors réseau la sauvegarde de la nuit, l'importe deux fois, juge la parité contre l'instantané, chronomètre chaque étape et détruit la copie. Rapport sans donnée personnelle dans `.migration/repetition-<horodatage>/` (voir `docs/migration/IMPORT.md`, « La répétition complète en une commande ») |
| `bun run migration:import` | L'import des données de l'ancien site, avec `DATABASE_URI` et `STRAPI_SOURCE_URI` de l'environnement (le script porte `--no-env-file` : le `.env` de travail n'est pas lu). À blanc par défaut ; `--real` écrit ; une base qui n'est pas sur ce poste demande `--remote-target --expected-database <nom>` (voir `docs/migration/IMPORT.md`). En production, sans accès SSH, l'import se lance dans le conteneur par `IMPORT_TOKEN` |
| `bun run admin:create <email>` | Crée un compte de l'administration, et la seule façon d'avoir le premier. Le mot de passe se tape au clavier, deux fois (voir « Créer un compte admin ») |
| `bun run test:integration` | Les tests d'intégration de `tests/integration/`, sur le banc. Avec un chemin : ce fichier seul |
| `bun run test:e2e` | Les essais de bout en bout de `tests/e2e/`, dans un vrai navigateur, contre l'application construite et branchée sur le banc. Avec un chemin : ce fichier seul |
| `bun run cutover:check` | Le contrôle d'un hôte (ticket 173) : lit en GET, 2 requêtes par seconde au plus, toutes les adresses de l'inventaire, le sitemap, le fichier robots, les anciennes routes d'authentification et le script de mesure, et écrit un rapport daté. L'hôte, de production seulement (`https://my-makeup.fr`, `https://v3.my-makeup.fr`, ou le banc de ce poste), par `HOST_CHECK_TARGET` (voir [`docs/tests/controle-hote.md`](docs/tests/controle-hote.md)) |
| `bun run cutover:ui-crawl` | Le crawl des interfaces (ticket 177) : un vrai navigateur ouvre 40 adresses en largeur téléphone (390 px) et bureau (1440 px) et relève les pages en 5xx, les erreurs de console, un `h1` ou une Nav qui n'est pas unique, un « undefined » ou « null » visible, un débordement, une image cassée. Lectures seules, 2 requêtes par seconde au plus. L'hôte, de production seulement ou le banc de ce poste, par `UI_CRAWL_TARGET` (voir [`docs/tests/crawl-interfaces.md`](docs/tests/crawl-interfaces.md)) |
| `bun run probes` | Les sondes de `tests/probes/` : lisent le site en ligne, en GET seulement, 2 requêtes par seconde au plus. Une autre cible par `PROBES_TARGET` (voir « Les sondes du site en ligne ») |
| `bun run image:build` | Construit l'image Docker `my-makeup:local` |
| `bun run image:check` | Vérifie l'image construite contre une base jetable (voir « Image Docker ») |
| `bun run notes:add` | Ajoute une note de version en attente : un type (`ajout`, `amelioration`, `correction`), puis la phrase entre guillemets (voir « Notes de version et publication ») |
| `bun run perf:lighthouse` | La vitesse des quatre pages de référence (P01 à P04) en mobile : 5 passages par page, médiane, budgets du plan 02 §7.5 et comparaison avec le site en ligne, rapport dans `docs/mesure/lighthouse-v3.md`. Sur le banc (`bun run bench:full`), seul et machine au repos : la commande refuse sinon, `--indicative` mesure quand même (voir [`docs/mesure/lighthouse.md`](docs/mesure/lighthouse.md)) |
| `bun run perf:pool-load` | La charge du pool de connexions à la base (ticket 268), sur le banc seulement, application lancée : `--requests` requêtes simultanées sur la page d'un profil, la recherche et `/api/health`, `--rounds` vagues, `--writes` créations de comptes en plus, ou `--lock` pour prendre toutes les connexions par un verrou extérieur. Dit les erreurs, la requête la plus lente et le pic de connexions à la base. Voir [`docs/pool-connexions.md`](docs/pool-connexions.md) |
| `bun run names:check [dossier…]` | Liste les noms du code qui sont encore français (fichiers, dossiers, noms déclarés, scripts, variables d'environnement lues, options des scripts) et sort avec le code 1 s'il en trouve hors des exceptions nommées. `--summary`, `--json` (voir [`docs/noms.md`](docs/noms.md)). Tourne dans la CI (job `qualite`), sous `ci-ok`, sans liste d'attente |
| `bun run release:publish` | Avec `--dry-run` : montre la prochaine publication sans rien écrire. Avec `--push` : publie, dans le workflow `release.yml` seulement |

Biome se lance par ces scripts ou par `bunx @biomejs/biome`, jamais par `npx biome` : c'est un paquet homonyme.

`bun run payload` et les scripts `payload:*` ont besoin des deux variables obligatoires, donc du `.env` de l'étape 2 de « Démarrer en local » : voir « Configuration durcie ».

## Tests

Les tests tournent avec `bun test`, lancé par les scripts ci-dessus. Pour un seul fichier : `bun --no-env-file test tests/unit/test-guard.test.ts`.

### Où ranger un test

| Dossier | Contenu |
|---|---|
| `tests/unit/` | Tests unitaires, en `*.test.ts`, et tests de composants React, en `*.test.tsx` : ni base, ni réseau |
| `tests/integration/` | Tests d'intégration, en `*.test.ts`, contre la pile de test locale |
| `tests/e2e/` | Essais de bout en bout, en `*.spec.ts` |
| `tests/probes/` | Sondes du site en ligne, en lecture seule |
| `tests/ci/` | Garde-fous de la CI et de l'image Docker : chacun est joué sur le dépôt, puis sur un exemple fautif |
| `tests/fixtures/` | Données fictives et fichiers témoins |
| `tests/support/` | Outils partagés par les tests |

Tous ces dossiers existent. `tests/probes/` ne contient aucun fichier `*.test.ts` ni `*.spec.ts` : les sondes se lancent par `bun run probes`, et leurs tests sont dans `tests/unit/probes.test.ts`.

### La garde d'environnement

`bun test`, lancé depuis la racine du dépôt, charge `tests/support/environment-guard.ts` avant tout fichier de test (`bunfig.toml`, section `[test]`). Si l'environnement permet de toucher autre chose que le banc de test local, la garde arrête tout avant le premier test. Son message nomme la variable en cause et ne recopie jamais une adresse complète.

Lancé depuis un sous-dossier, `bun test` ne charge pas la garde : bun lit le `bunfig.toml` du dossier où il est lancé, pas celui d'un dossier parent. Un outil de test qui ouvre lui-même une base appelle donc `checkBase` sur l'adresse qu'il va ouvrir, sans compter sur ce chargement.

| Variable | Règle |
|---|---|
| `APP_ENV` | `test` (ou rien). `prod` est toujours refusé, toute autre valeur aussi (`preprod` comprise : il n'y a pas de préprod) |
| `DATABASE_URI` | Hôte local, nom de base fini par `_test`, et aucun paramètre `host` ni `hostaddr` : il remplacerait l'hôte de l'adresse |
| `STRAPI_SOURCE_URI` | La même règle que `DATABASE_URI` : la fausse base Strapi du banc, jamais la vraie |
| `BASE_URL`, `NEXT_PUBLIC_SITE_URL` | Adresse locale. Jamais la prod, ni aucun sous-domaine de `my-makeup.fr` |
| `SMTP_HOST` | Hôte local : le capteur de mails |
| `MAILPIT_URL` | Hôte local : l'API du capteur de mails |
| `SMTP_*`, `EMAIL_*`, `MAILGUN_*`, `RESEND_*` | Aucun domaine en `my-makeup.fr` : un expéditeur de test écrit depuis `@example.test` |
| `S3_ENDPOINT` | Hôte local |
| `S3_BUCKET` | Nom fini par `-test` |
| `GOOGLE_OIDC_ISSUER` | Hôte local : le faux Google du banc, jamais Google |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Une valeur qui porte le mot « factice », et jamais sans `GOOGLE_OIDC_ISSUER` : la connexion viserait Google lui-même |

Un hôte local est `localhost`, `127.0.0.1` ou `::1`, ou le nom du service dans le réseau de la pile de test : `postgres`, `mailpit`, `s3mock`, `fake-google`. Une variable absente n'est pas vérifiée : les tests unitaires tournent sans aucune variable.

`bun test` lit tout seul le fichier `.env`, puis `.env.test`, qui l'emporte. Lancé sans `--no-env-file` sur un poste de développement, il tourne donc sous l'environnement du banc de test, et tout ce que `.env.test` ne règle pas vient du `.env` de travail : la garde vérifie aussi ces variables-là. Les tests ne dépendent jamais du `.env` de travail : les scripts passent `--no-env-file`, et c'est par eux qu'on lance les tests.

Une nouvelle variable qui désigne un service extérieur s'ajoute à la garde, avec son cas dans `tests/unit/test-guard.test.ts`.

### Le banc de test

Les tests d'intégration tournent contre six conteneurs jetables : PostgreSQL en mémoire, un capteur de mails, un stockage d'objets avec l'API S3, un faux Google, un faux Umami et une fausse liste des communes. Rien n'y est réel, et rien n'est gardé à l'arrêt.

Pour travailler dans le site local, sans écrire de test, **quatre gestes** (l'agent n'a plus besoin d'un compte en ligne) :

```sh
bun run bench:full        # 1. monter : pile, base, jeu fictif, application sur http://localhost:3100 (premier plan)
bun run bench:session admin  # 2. une session : fichiers dans .banc/sessions/<banc>/, le jeton n'est pas affiché
bun run bench:reset  # 3. remettre à l'état de départ, en une dizaine de secondes (reprendre une session ensuite)
bun run bench:down           # 4. tout arrêter et tout effacer
```

Le jeu : 12 profils types (comptes `jeu-profil-*@example.test`), 3 talents, 3 articles dont un brouillon, et un compte de chaque type du site (`jeu-admin@example.test`…). L'administration en compte 19 profils : les 12 types et les 7 profils vides que le serveur crée avec les comptes types. Détail : [`docs/tests/banc.md`](docs/tests/banc.md), « Le banc complet ».

```sh
bun run bench:up                                                # démarre le banc, rend la main quand les quatre services répondent
bun run test:integration                                       # lance les tests d'intégration
bun run test:integration tests/integration/bench-base.test.ts   # un seul fichier
bun run bench:down                                              # arrête tout et efface les données
```

- `.env.test` décrit le banc. Il est versionné, parce que toutes ses valeurs sont factices.
- Sans le banc, `bun run test:integration` s'arrête avant le premier test et dit quoi démarrer.
- Lancer les tests d'intégration vide la base du banc.
- Plusieurs bancs tournent côte à côte sur un même poste, chacun sous son nom et sur ses ports : `BENCH_INSTANCE=mon-banc BENCH_OFFSET=20 bun run bench:up`.
- Un test obtient un compte fictif et sa session en un appel, sans mot de passe à saisir : `await createAccount('admin')`, `'redaction'`, `'maquilleuse'` (avec son profil vide), `'maquilleuse-sans-profil'`, ou `'maquilleuse-non-verifiee'` (sans session).
- La fabrique crée aussi les comptes que l'ancien site apporte et ceux qui ne se connectent pas : `'maquilleuse-bloquee'`, `'reprise-avec-hash'` (hash bcrypt d'un mot de passe fictif connu), `'reprise-google'` et `'reprise-google-avec-hash'` (session ouverte sans mot de passe, comme par Google), `'reprise-facebook'`. Le jeu du banc en pose un exemplaire fixe de chaque type, sans doublon quand on le rejoue : `await setDatasetAccounts()` (`tests/fixtures/accounts.ts`).
- Le jeu du banc pose aussi les 12 profils types du plan de tests (référence, ville voisine, ville éloignée, indisponible, disponibilité inconnue, vide, actif non publiable, sans contact public, ancien nom accentué, vérifiée, masquée, textes maximaux), chacun avec sa maquilleuse fictive et ses photos, toujours les mêmes, sans doublon quand on le rejoue : `await placeDemoProfiles(payload)` (`src/demo-data/`). Hors du banc, il refuse de tourner avant de rien lire ni écrire.
- Toute règle d'accès a ses lignes dans la matrice d'accès, jouées par l'API REST et par l'API locale avec les règles actives : `tests/integration/payload-access.test.ts`.
- Sur le banc, l'application envoie tous ses mails au capteur. Un test lit le sien, avec son destinataire, son sujet et ses liens : `await waitMail({ pour: adresse })`.
- Un test dépose un objet dans le stockage et le relit : `await dropObject(cle, contenu)`, `await readObject(cle)`.
- L'import se teste sur une fausse base Strapi qui porte chaque cas connu de la vraie, ouverte en lecture seule, avec ses photos dans le stockage : `bun run bench:source` la crée, à l'identique à chaque fois. `bun run bench:import --real` y lance l'import ; un test le lance par `importOnBench()` (`tests/support/import.ts`).
- La connexion Google se teste sans compte Google ni secret : le faux Google tient la place de Google (`GOOGLE_OIDC_ISSUER`), et un test choisit qui se connecte et comment cela finit, parmi quatre scénarios : `fakeGoogle().choisir({ scenario: 'refus' })`.

Le détail est dans [`docs/tests/banc.md`](docs/tests/banc.md) : les services et leurs adresses, les deux variables d'instance, l'écriture d'un test d'intégration, la remise à zéro, le capteur de mails, le stockage d'objets, la fabrique de comptes et ses types, le jeu de comptes fixes, les 12 profils types, le faux Google et ses quatre scénarios, les images épinglées, la fausse base Strapi.

### Les essais de bout en bout

Un essai de bout en bout ouvre l'application dans un vrai navigateur, à 1440 px et à 390 px. L'application est construite pour la production, démarrée sur le port du banc et branchée sur lui ; elle ne lit aucun fichier `.env`.

```sh
bunx playwright install chromium               # une fois par poste : le navigateur de Playwright
bun run bench:up
bun run test:e2e                               # tous les essais
bun run test:e2e tests/e2e/shell.spec.ts    # un seul fichier
```

- La commande vide la base du banc, construit l'application, puis Playwright la démarre, lance les essais et l'arrête.
- Une session s'obtient sans mot de passe : `createAccount('admin')`, puis `context.addCookies(compte.session.cookies)`.
- `violationsSevere(page)` (`tests/support/axe.ts`) rend les violations d'accessibilité « serious » et « critical » de la page.
- Un essai en échec garde sa trace, sa vidéo et sa capture dans `test-results/essais/`.
- Une cible sur `my-makeup.fr` arrête tout avant le premier essai.

Le détail est dans [`docs/tests/e2e.md`](docs/tests/e2e.md) : écrire un essai, l'accessibilité, lire un échec, les garde-fous, les pièges.

### Les sondes du site en ligne

Les sondes lisent le site en ligne comme une visiteuse anonyme, sans jamais rien y écrire : c'est la seule exception à « rien vers le site en ligne ». Les adresses ne changent pas avec la v3 : elles lisent aujourd'hui le site actuel.

```sh
bun run probes                                       # https://my-makeup.fr
PROBES_TARGET=http://localhost:3100 bun run probes    # une autre cible : le banc, un domaine temporaire
PROBES_STATS_TOKEN=… bun run probes                  # avec le jeton du service, R02 compare
PROBES_API=aucune bun run probes                     # Strapi est arrêté : plus de partie Strapi dans R05
```

- R01 : la garde interrompt toute requête autre qu'un GET, tout ce qui va vers la mesure d'audience (`/u`) ou vers un autre hôte. Elle se vérifie avant la première requête.
- R02 : les profils du sitemap sont exactement les profils publiables (route des statistiques, avec le jeton). Sans jeton : « inconnu », jamais « vert ».
- R03 : 5 profils au hasard du sitemap répondent 200, avec un `h1` dans le HTML du serveur, sans « undefined » ni « null ».
- R04 : une adresse inconnue répond 404.
- R05 : les cinq en-têtes de sécurité, les listes privées fermées (401 ou 403), les anciennes routes en 404 ; l'API de Strapi tant qu'il tourne.
- R06 : certificats valides plus de 21 jours, domaines plus de 30 jours (site, photos, Umami).
- Une requête à la fois, 2 par seconde au plus. Le rapport désigne un profil par une empreinte, jamais par son adresse.
- `PROBES_TARGET` n'est lue que par les sondes : la garde des essais refuse toujours la prod.
- Le lundi à 07:00 (Paris), le workflow `.github/workflows/sondes.yml` les lance sans aucun secret et écrit le rapport dans le résumé de l'exécution ; une sonde rouge fait échouer l'exécution, que le rapport de 07:30 lit par GitHub.

Le détail est dans [`docs/tests/sondes.md`](docs/tests/sondes.md) : chaque sonde, la garde, lire le rapport, retrouver un profil rouge.

### Le HTTP sortant

Aucun test n'appelle Internet. `bun test`, lancé depuis la racine du dépôt, charge `tests/support/preload-outgoing-http.ts` avant tout fichier de test (`bunfig.toml`, section `[test]`) : dès lors, aucune requête HTTP ne quitte le poste.

- Un service extérieur se simule en une déclaration, dans le test :

  ```ts
  simuler(http.get('https://referentiel.example.test/communes', () => HttpResponse.json([{ nom: 'Annecy', code: '74010' }])))
  ```

- Une requête vers un hôte que rien ne déclare est refusée, et le test échoue avec un message qui nomme l'hôte, même si le code testé attrape l'erreur.
- Les services du banc de test ne sont pas interceptés : ce poste, et les services de `compose.test.yml`.
- Le code appelle un service extérieur par `fetch` : sous bun, c'est la seule sortie qui se simule.

Le détail est dans [`docs/tests/http-sortant.md`](docs/tests/http-sortant.md) : les gestes (panne, réseau coupé, service muet), ce qui passe, les deux couches et leurs limites.

## Licence

Aucune licence n'est accordée pour l'instant : tous droits réservés.
