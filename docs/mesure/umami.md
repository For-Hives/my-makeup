# La mesure d'audience : Umami par le chemin `/u`, et le catalogue d'événements

La mesure du site passe par Umami, servi par le site lui-même. Une visiteuse dont le navigateur filtre le domaine de l'instance est quand même comptée, et déplacer l'instance ne change qu'une variable.

## Le chemin `/u`

| Adresse | Réponse |
|---|---|
| `GET /u/script.js` | Le traceur de l'instance, relayé |
| `POST /u/api/send` | Une mesure, relayée vers l'instance. Un `GET` répond 405 |
| tout autre chemin sous `/u` (`/u`, `/u/login`, `/u/api/autre`, `/U/script.js`…) | 404. Le tableau de bord, la connexion et le reste de l'API de l'instance ne sont jamais servis |

Le code : `src/app/u/` (trois fichiers de route) et `src/lib/analytics/relay.ts`.

**Ce que l'instance reçoit** : seulement l'agent, le type de contenu, les langues acceptées, le jeton `x-umami-cache` que son traceur rend après un envoi, et l'adresse de la visiteuse, une fois, dans `True-Client-IP` (la dernière entrée de `X-Forwarded-For`, celle que le proxy a écrite). Ni cookie, ni autorisation, ni Referer, ni adresse ou lieu écrits par le navigateur. Ce qui revient perd son `Set-Cookie`. Une redirection de l'instance n'est pas suivie.

**Coupure** : une instance muette est abandonnée après 10 secondes (504), une panne répond 502. La page n'attend jamais : le traceur est ajouté en asynchrone.

**Hors du site, rien ne part vers la vraie instance.** Le relais ne parle à une instance qui n'est pas de ce poste que si la requête vient de `my-makeup.fr` ou `www.my-makeup.fr` ; ailleurs, le script est un script vide et une mesure est reçue puis jetée. Côté navigateur, `data-domains` fait la même chose. Côté environnement, l'application refuse de démarrer avec une instance de ce poste sur une adresse déployée.

## Le réglage

| Variable | Rôle |
|---|---|
| `UMAMI_ORIGIN` | L'instance. Absente : l'instance actuelle sur le site, rien ailleurs (`/u` répond 404). Une valeur illisible arrête l'application au démarrage |
| `NEXT_PUBLIC_UMAMI_DOMAINS` | Les hôtes que le traceur compte. Lue à la construction des pages |

L'identifiant du site Umami est public et ne change pas : il est dans le HTML de chaque page, et reste le même quand l'instance déménage avec son historique. L'étiquette (`data-tag`) est la version du build, celle de `/api/health`.

## Le script de l'en-tête

`src/lib/analytics/umami.ts` fabrique le script en ligne de chaque page (`src/app/(front)/layout.tsx`, jamais l'administration). Il définit le filtre `mmAvantEnvoi`, une salle d'attente pour les événements suivis avant le traceur, puis ajoute le traceur en asynchrone.

Le filtre n'envoie rien depuis un navigateur automatisé (`navigator.webdriver`, un agent `HeadlessChrome`), depuis une page encadrée, ni depuis un navigateur qui a posé `umami.disabled`. Aucun autre filtre de robots n'existe : ceux qui se déclarent restent comptés, ainsi que nos propres visites (décisions du 13/10). L'adresse envoyée ne garde que les paramètres `utm_*`, le référent perd son paramètre et son ancre.

Le script est écrit en chaîne, sans syntaxe postérieure à ES2019 : un `?.` laissé dans un script en ligne a déjà coûté les visites de Safari avant 13.4. Un test lit le texte.

## L'opposition d'une visiteuse

La politique de confidentialité (`/politique-de-confidentialite`) porte un bouton, « Ne plus mesurer mes visites » (`src/components/analytics/AnalyticsOptOut.tsx`). Un clic pose la clé `umami.disabled` dans le `localStorage` du navigateur : le filtre de l'en-tête et le traceur d'Umami la lisent, et plus rien ne part vers le faux Umami ni vers l'instance. Le bouton devient « Réactiver la mesure d'audience » ; un second clic retire la clé. Le choix vaut pour ce navigateur, jusqu'à ce qu'on le retire. La clé et les deux gestes sont dans `src/lib/analytics/opt-out.ts`. Un stockage bloqué (fenêtre privée, données coupées) ne casse rien et ne compte pas pour une opposition.

## Le catalogue d'événements

`src/lib/analytics/events.ts` est la table fermée des événements (le plan 04 §3.3 et, depuis le 27/10/2026, les événements des entonnoirs : voir plus bas) et `track()` (`src/lib/analytics/track.ts`) est le seul chemin d'une page vers Umami :

```ts
import { track } from '@/lib/analytics/track'

track('contact_click', { pid: 12, channel: 'phone' })
track('profile_publiable') // un événement sans propriété n'en prend pas
```

- Un nom inconnu, une propriété en trop ou manquante, une valeur hors de sa liste : le code ne compile pas. À l'exécution, l'événement tombe tout entier.
- Rien n'est émis en développement ni dans les tests, ni sans Umami, ni depuis un navigateur automatisé. Rien ne lève. Pendant que le traceur charge, l'événement attend dans la salle d'attente.
- Aucune donnée personnelle : des listes fermées, des booléens, des entiers, l'identifiant d'un profil (`pid` : l'identifiant de l'ancien site, ou `v3-<id>` pour un profil créé depuis), un chemin sans paramètre. Un texte qui ressemble à un email ou à un téléphone fait tomber l'événement.
- Ajouter un événement : une ligne dans `CATALOG`, une ligne dans `EXAMPLES` de `tests/unit/analytics-events.test.ts`, et sa ligne dans le tableau « Le catalogue complet » ci-dessous. Renommer une valeur coupe sa série dans Umami : le catalogue ne fait que grandir. Une propriété ajoutée à un événement qui existe se déclare `optional(...)` : les envois d'avant restent valides.
- Aucun appel direct à Umami hors de `src/lib/analytics/` : un test statique le garde.

Les Web Vitals (`web-vitals`, un événement par mesure : `CLS`, `FCP`, `INP`, `LCP`, `TTFB`) partent de chaque page chargée, sans échantillon, depuis `src/components/analytics/WebVitals.tsx`. Le nom garde son tiret : la série existe déjà dans le rapport du lundi.

## Le clic sur un contact d'un profil public (`contact_click`)

Chaque lien de la section « Réseaux sociaux & contacts » d'un profil public, et chaque bouton de la feuille « Contacter <prénom> » (téléphone, email, Instagram, Facebook, LinkedIn, YouTube, site), émet un `contact_click` avec le `pid` du profil et le `channel`, une fois par clic (le clic du milieu aussi). C'est le principal signal de demande. Le code est `src/lib/analytics/contact-click.ts` (la règle et l'envoi) et `src/components/profile/TrackedContactLink.tsx` (le lien). La feuille (`src/components/profile/ContactButton.tsx`) réutilise ce lien : un appui sur « Contacter » ne compte rien, c'est le clic sur l'une de ses actions qui compte, avec le canal de l'action.

Il ne part pas :

- quand la visiteuse est la propriétaire du profil. La page publique est partagée et en cache : elle ne sait pas qui la lit. Le navigateur demande donc à `GET /api/dashboard/my-pid` le `pid` du profil de la session (jamais mis en cache, `null` sans cookie, sans accès à la base dans ce cas) et le compare à celui de la page. Le clic attend cette réponse si elle n'est pas encore venue ; si elle échoue, le clic est compté ;
- quand elle vient de son espace (le référent est une page `/auth/...` du site) ;
- quand l'adresse porte `utm_campaign=relance` (lien d'un email de relance) ;
- depuis l'aperçu de sa propre page (`/auth/apercu-profil`), qui ne compte aucun clic (`mesure={false}`).

Un profil sans contact public n'a ni section ni lien, donc aucun événement. Le `pid` d'un profil est l'identifiant de l'ancien site s'il en a un, sinon `v3-<id>` (`src/lib/profile/pid.ts`). Tests : U84 dans `tests/unit/analytics-contact-click.test.tsx`, E52 dans `tests/e2e/analytics-contact-click.spec.ts`.

## La recherche, les appels à l'action et les pages d'erreur (ticket 145)

| Événement | Quand | Propriétés |
|---|---|---|
| `search_submit` | La page de résultats d'une recherche s'affiche | `has_city` (une ville a été saisie), `results` (`0`, `1-5`, `6-20`, `21+`), `from` (`formulaire` si le formulaire vient d'être envoyé, `lien` sinon) ; depuis le 27/10/2026 `has_word` et `zone` |
| `search_result_click` | Clic sur la carte d'un résultat | `rank` (place dans toute la liste, toutes pages comprises, à partir de 1), `pid` |
| `cta_click` | Clic sur un appel à l'action | `where` : `cta_recherche` et `cta_inscription` (bloc de fin de page), `nav_recherche` (bouton de la barre, écran large), `nav_recherche_mobile` (le même bouton, menu déplié sous 1024 px), `accueil_explorer` (le badge « Explorer les maquilleuses » sur l'arche du haut de l'accueil, depuis le 26/10/2026), puis, depuis le 27/10/2026, une valeur par lien de la barre, du pied de page et des pages (voir « Les valeurs de `where` ») ; `page` : la route de la page |
| `not_found` | Une page 404 s'affiche | `kind` : `profil`, `talent`, `blog` d'après le premier segment de l'adresse, `autre` sinon ; depuis le 27/10/2026 `path` : l'adresse sans requête ni ancre, `/profil/[slug]` pour une fiche |
| `app_error` | Une page d'erreur s'affiche | `scope` (`site`, `espace`, `global`), `code` (`chunk_load` si un script n'a pas pu charger, `render` sinon) ; depuis le 27/10/2026 `route` : le motif de la page (`/profil/[slug]`) |

**Aucun texte saisi ne part.** La page de résultats ne donne au navigateur que deux faits (une ville, une tranche) et une empreinte courte des mots, qui sert à ne pas recompter la même recherche ; l'empreinte n'est jamais envoyée. Le message d'une erreur n'est jamais lu.

**Le compteur de recherches (issue 1002).** La même décision (`shouldEmit`) ajoute aussi 1 au total du jour en base, sans Umami : jour, département, avec ville, sans résultat, jamais de texte. Voir `docs/mesure/statistiques-hebdomadaires.md`, « Le compteur de recherches ».

**Aucun doublon.** Le navigateur retient, pour l'onglet (`sessionStorage`, clé `mm-analytics-last`), la dernière vue comptée. Une 404 ou une page d'erreur rechargée n'est pas recomptée ; une recherche revue (page suivante, retour) non plus, sauf si le formulaire vient d'être envoyé (`src/lib/analytics/duplicate.ts`). Un stockage bloqué compte chaque vue.

**Le traceur sur les pages qui l'ont perdu.** Le script de l'en-tête ne s'exécute pas quand le navigateur dessine lui-même la page après un échec du serveur : la 404 d'une adresse que rien ne sert (`src/app/global-not-found.tsx`), celle d'un profil, d'un talent ou d'un article inconnu, et toute page d'erreur. Ces pages ajoutent donc le traceur elles-mêmes avant d'émettre (`src/lib/analytics/loader.ts`), s'il n'est pas déjà là. La page d'erreur globale (`global-error.tsx`) fait de même.

Le `pid` d'une carte (`ProfileCard.pid`) est lu à part, par les identifiants que la lecture publique a donnés (`readPids`) : l'ancien identifiant n'est pas un champ que le public lit.

Tests : `tests/unit/analytics-search-errors.test.ts`, et `tests/e2e/analytics-search-errors.spec.ts` contre le faux Umami.

## L'onboarding : retiré le 27/10/2026, plus émis (ticket 148)

**Retirés le 27/10/2026, plus émis.** Le parcours guidé qui suivait l'inscription n'existe plus (registre `sans-onboarding`) : une maquilleuse arrive directement sur son espace, `/auth/profil`, et `/auth/init-account` redirige (308) vers lui. Les deux événements ci-dessous restent dans le catalogue, sans changer de nom, pour que leurs séries d'avant gardent leur lecture ; la question « Comment as-tu connu My Makeup ? » n'est plus posée. Ce qui garde l'entonnoir d'inscription : `account_arrival` (voir le catalogue), émis quand la maquilleuse ouvre son espace avec un profil encore entièrement vide.

| Événement | Quand (jusqu'au 26/10/2026) | Propriétés |
|---|---|---|
| `onboarding_step` (retiré le 27/10/2026, plus émis) | Le serveur avait enregistré une étape de l'accueil | `step` : `identite`, `zone`, `photo`, `contact`, `prestation`, `termine` ; `verification_email` et `compte_cree` viennent de l'ancien site |
| `onboarding_source` (retiré le 27/10/2026, plus émis) | La réponse à « Comment as-tu connu My Makeup ? » était choisie | `source` : `instagram`, `google`, `bouche-a-oreille`, `ecole`, `ia`, `autre` |

Les séries d'avant le 27/10/2026 restent lisibles dans Umami ; aucune n'est alimentée après. Les tests de l'accueil (`tests/unit/analytics-onboarding.test.tsx`) sont supprimés avec lui.
## Les entonnoirs : ce qui part depuis le 27/10/2026

Andy veut juger sur un mois si le site plaît, avec un trafic encore faible : chaque étape d'un parcours est un **événement distinct** (Umami enchaîne des noms d'événements et des pages vues, pas des valeurs de propriété), et les propriétés servent à découper. La source de la visite (moteur, assistant IA, direct, réseaux) n'est **pas** redoublée : Umami la donne déjà par le référent et les `utm_*`, il suffit de filtrer l'entonnoir dessus.

Les événements d'avant ne changent ni de nom ni de valeur : le catalogue ne fait que grandir (un test le garde, `BEFORE_27_OCTOBER` dans `tests/unit/analytics-events.test.ts`). Une propriété ajoutée à un événement d'avant est **facultative** : les envois d'avant restent valides, et ses séries ne se coupent pas.

### Le catalogue complet

| Événement | Quand il part | Propriétés (valeurs) | Entonnoir |
|---|---|---|---|
| `search_submit` | La page de résultats d'une recherche s'affiche, une fois par recherche | `has_city`, `results` (`0`, `1-5`, `6-20`, `21+`), `from` (`formulaire`, `lien`) ; depuis le 27/10 : `has_word` (des mots ont été tapés, jamais lesquels), `zone` (code du département visé, `2A`/`2B`, ou `unknown`) | visiteuse |
| `search_refine` (27/10) | La recherche s'affiche avec un filtre ou un tri dans l'adresse, une fois par jeu de filtres | `results` (tranche **après** filtres), `budget` (`aucun`, `minimum`, `maximum`, `fourchette`), `sort` (`relevance`, `price`, `recent`), `specialty` (`wedding`, `event`, `photoFashion`, `screenStage`, `specialEffects`, `selfMakeupCourse`) si choisie | visiteuse |
| `search_result_click` | Clic sur la carte d'un résultat **d'une recherche saisie** | `rank` (place dans toute la liste, à partir de 1), `pid` | visiteuse |
| `card_click` (27/10) | Clic sur une carte de profil **hors recherche saisie** | `origin` (`zone`, `talent`, `mise_en_avant`, `plus_consultees`, `classement`, `blog`), `rank` (place parmi les cartes visibles de la liste : « Mise en avant » cache les cartes au-delà de six, tirées au hasard à chaque chargement), `pid` | visiteuse |
| `profile_view` (27/10) | La fiche publique s'affiche, une fois par onglet et par fiche (un rechargement ne recompte pas) | `pid`, `from` (`recherche`, `zone`, `talent`, `classement`, `blog`, `accueil`, `autre_page`, `externe`, `direct`) : la page quittée par un lien du site, sinon le référent du navigateur. Pas pour la propriétaire de la fiche, ni depuis son espace, ni par un lien de relance (mêmes règles que `contact_click`) | visiteuse |
| `contact_click` | Clic sur un moyen de joindre la maquilleuse (téléphone, email, Instagram, Facebook, LinkedIn, YouTube, site) | `pid`, `channel` (jamais la valeur) | visiteuse |
| `devis_click` (27/10, nom du plan 04) | Premier champ touché du formulaire de devis de la fiche | `pid`, `from` (`profil`) | visiteuse |
| `quote_submit` (27/10) | Envoi du formulaire de devis | `pid` | visiteuse |
| `demande_envoyee` (27/10, nom du plan 04) | Le serveur a enregistré la demande | `pid`, `source` (`profil`) | visiteuse |
| `quote_error` (27/10) | Le devis n'est pas parti | `pid`, `cause` (`validation`, `trop_de_demandes`, `verification`, `indisponible`, `echec`) | visiteuse |
| `cta_click` | Clic sur un appel à l'action (liste ci-dessous) | `where` ; depuis le 27/10 : `page` (la route de la page, par exemple `/blog/[slug]`) | tous |
| `not_found` | Une page 404 s'affiche | `kind` (`profil`, `talent`, `blog`, `autre`) ; depuis le 27/10 : `path` (l'adresse sans requête ni ancre ; `/profil/[slug]` pour toute fiche : le nom d'une fiche supprimée ou renommée est une personne) | contenu |
| `app_error` | Une page d'erreur s'affiche | `scope`, `code` ; depuis le 27/10 : `route` (le motif de la page, `/profil/[slug]`, jamais l'adresse) | contenu |
| `platform_contact_submit` | Le formulaire de contact du site est envoyé | `ok`, `status` | tous |
| `signup_start` | Premier envoi du formulaire d'inscription, ou clic sur Google depuis la page d'inscription | `method` (`email`, `google`) | maquilleuse |
| `signup_wall` (27/10) | L'écran « Vérifie ton adresse email » s'affiche, une fois par onglet | aucune. L'écran est le même pour une adresse neuve et pour une adresse qui a déjà un compte (ticket 083) : c'est un compte de **demandes**, pas de comptes créés | maquilleuse |
| `email_confirmed` (27/10) | Le lien du mail de confirmation est suivi et le compte est activé (pas pour « déjà confirmé », ni pour un lien invalide) | aucune | maquilleuse |
| `login_result` | Une connexion aboutit ou échoue | `method`, `ok`, `code` | maquilleuse |
| `auth_error`, `session_expired` | Une erreur d'authentification est montrée, une session a expiré | `code` / `where` | maquilleuse |
| `onboarding_step` (retiré le 27/10/2026, plus émis) | Le serveur avait enregistré une étape de l'accueil, la première fois | `step` (voir la section de l'onboarding) | maquilleuse |
| `onboarding_source` (retiré le 27/10/2026, plus émis) | La réponse à « Comment as-tu connu My Makeup ? » | `source` | maquilleuse |
| `account_arrival` (27/10) | La maquilleuse ouvre `/auth/profil` alors que son profil est encore entièrement vide : l'arrivée d'un nouveau compte sur son espace, sans accueil entre les deux. Une fois par onglet : revenir sur l'espace encore vide, par la flèche « Retour » par exemple, ou le recharger, ne recompte pas | aucune | maquilleuse |
| `profile_save` | Une réponse du serveur à un enregistrement de l'espace | `section`, `ok` | maquilleuse |
| `profile_publiable` | Le serveur dit que **cet** enregistrement a rendu le profil publiable | aucune | maquilleuse |
| `profile_indexable` (27/10) | Le serveur dit que **cet** enregistrement a rendu le profil indexable (le niveau plus riche que Google peut référencer) : une seule fois, jamais pour le chemin inverse. Un enregistrement peut donner les deux événements | aucune | maquilleuse |
| `profile_visibility`, `upload_error`, `account_delete`, `contact_reveal` | Comme avant | comme avant | maquilleuse |
| `article_depth_50` (27/10) | La moitié du texte d'un article est passée sous le bas de l'écran, **après un vrai défilement**, une fois par page | `page` (`/blog/[slug]`) | contenu |
| `article_depth_90` (27/10) | Neuf dixièmes du texte, une fois par page. Un saut direct à la fin envoie d'abord `article_depth_50` : les deux s'enchaînent | `page` | contenu |
| `article_link_click` (27/10) | Clic sur un lien **dans le texte** d'un article (pas sur un lien d'ancre) | `kind` (`interne`, `externe`, `recherche`, `inscription`, `profil`), `page`. Jamais l'adresse du lien | contenu |
| `share_click` (27/10) | Clic sur un bouton de partage d'un article | `network` (`email`, `linkedin`, `facebook`), `page`. L'adresse partagée est celle de l'article, elle n'est pas envoyée | contenu |
| `web-vitals` | Comme avant | comme avant | technique |

Les valeurs de `where` de `cta_click`, une par lien, jamais renommées :

| Zone | Valeurs |
|---|---|
| Bloc du bas des pages | `cta_recherche` (« Trouver ma maquilleuse »), `cta_inscription` (« Je suis maquilleuse ») : la page qui les porte est dans `page` |
| Barre | `nav_recherche`, `nav_recherche_mobile` (le bouton, selon la largeur), `nav_logo`, `nav_connexion`, `nav_espace`, `nav_particulier_pourquoi`, `nav_particulier_trouver`, `nav_particulier_centraliser`, `nav_particulier_explorer`, `nav_maquilleuse_pourquoi`, `nav_maquilleuse_partenariats`, `nav_solutions_particuliers`, `nav_solutions_maquilleuses`, `nav_blog` |
| Pied de page | `footer_particulier_pourquoi`, `footer_particulier_trouver`, `footer_particulier_centraliser`, `footer_particulier_explorer`, `footer_maquilleuse_pourquoi`, `footer_maquilleuse_partenariats`, `footer_solutions_particuliers`, `footer_solutions_maquilleuses`, `footer_blog`, `footer_a_propos`, `footer_contact`, `footer_mentions_legales`, `footer_cgu`, `footer_confidentialite`, `footer_plan_du_site`, `footer_reseau` (les liens vers nos réseaux) |
| Accueil | `accueil_explorer` (le badge de l'arche), `accueil_collab_rejoindre`, `accueil_collab_visibilite`, `accueil_collab_trouver`, `accueil_collab_solution` (les quatre boutons de la bande « collaborer »), `accueil_talent` (les spécialités) |
| Autres pages | `recherche_idee` (« Une idée pour commencer »), `recherche_vide_inscription`, `recherche_vide_suggestion` (les liens d'une recherche sans résultat), `introuvable_accueil` et `erreur_accueil` (« Retourner à l'accueil » des pages 404 et d'erreur), `zone_recherche`, `talent_recherche`, `blog_liste_recherche`, `article_retour_blog`, `classement_voir`, `classement_contact`, `devis_envoye_recherche`, `page_connexion` |

### Comment ça part

- **Un seul écouteur** (`src/components/analytics/ClickMeasure.tsx`, monté dans la mise en page des pages publiques) lit des attributs que le balisage porte : `data-cta="<where>"`, `data-share="<réseau>"`, `data-card-origin` et `data-card-pid`, et tout lien dans un élément `data-article-body`. Le pied de page, la barre, les cartes et les boutons de partage restent des composants serveur, sans script. Le code est `src/lib/analytics/delegated.ts`. Un lien qui a déjà son événement (`TrackedLink`, `TrackedContactLink`) ne porte pas ces attributs : aucun clic n'est compté deux fois. Le clic du milieu compte aussi.
- **Un mot de `where` posé dans le balisage doit être dans le catalogue, et chaque mot du catalogue doit servir** : `tests/unit/analytics-funnels.test.tsx` lit les sources.
- **La profondeur de lecture** est `src/components/analytics/ArticleDepth.tsx` (un écouteur de défilement passif, au plus une lecture par image, retiré à 90 %).
- **L'origine d'une vue de profil** : Next passe d'une page à l'autre sans changer `document.referrer`. L'écouteur retient donc la page qu'un lien du site quitte (`leftPage`), que la vue du profil lit puis efface ; sans elle, le référent du navigateur dit « externe » ou « direct ».
- **Le devis** (`src/components/quote/QuoteRequestForm.tsx`) reçoit le `pid` de la fiche, jamais son adresse (`slug`) : le `pid` est public, le slug ne part dans aucun événement. Il passe par `profileVisitCounts` (`src/lib/analytics/my-pid.ts`) : la propriétaire de la fiche ne compte pas.
- **`profile_indexable`** vient du serveur, comme `profile_publiable` : `withPublishableTransition` relit les deux drapeaux avant et après l'enregistrement.
- **Le chemin d'une 404 et la route d'une erreur** passent par `notFoundPath` et `routeOf` (`src/lib/analytics/values.ts`).

### Ce qui ne part pas

- Aucun nom, email, téléphone, adresse de lien, texte saisi, ni valeur d'un champ. Pour la recherche : `has_word` dit seulement qu'il y a des mots ; la ville tapée n'est jamais envoyée, seulement le code du département que le serveur en tire (le même que celui du compteur de recherches).
- Les liens sortants ne sont pas un événement à part : ils sont déjà dans `contact_click` (contacts d'une fiche), `share_click` (partage), `article_link_click` (`externe`) et `cta_click` (`footer_reseau`).
- **« Profil vérifié »** n'est pas mesuré : l'état vit côté serveur (`profiles.verified`, posé par l'équipe) et rien n'émet depuis le serveur vers Umami. Le nombre se lit en base.
- **Deux choses que le site faisait déjà et que ce travail n'a pas changées** : chaque envoi d'Umami porte l'adresse de la page (`url`), donc le slug d'une fiche vue ou d'une 404 y est, et l'événement `web-vitals` envoie `page` avec le chemin réel, slug de fiche compris. Les événements des entonnoirs, eux, n'envoient que des routes (`/profil/[slug]`). La politique de confidentialité (texte tenu à l'identique du site en ligne par `tests/unit/legal-pages.test.tsx`) dit « clics sur certains boutons » : elle ne détaille pas encore les nouvelles mesures. La mettre à jour demande une ligne au registre des changements voulus et une décision d'Andy.
- Rien n'est émis depuis un navigateur automatisé, ni par `umami.disabled` (« Ne plus mesurer mes visites »), ni en développement : le filtre et `track()` sont ceux d'avant.

## Entonnoirs à créer dans Umami

Umami ne permet pas de les créer par l'API sans identifiants : voici le pas-à-pas pour Andy.

1. Ouvrir Umami, choisir le site, puis **Rapports > Entonnoir** (ou « Funnel »), puis **Créer un entonnoir**.
2. Donner le nom indiqué, régler la **fenêtre** (le temps maximal, en minutes, entre la première et la dernière étape).
3. Pour chaque étape : **Ajouter**, choisir **Page vue** (« Viewed page ») ou **Événement** (« Triggered event »), saisir la valeur exacte du tableau. Un joker d'adresse se termine par `*` (`/blog/*`).
4. Enregistrer, puis **Exécuter**. Pour découper par source, ajouter un filtre au rapport : **Référent**, **Canal** (`organicSearch`, `social`, `direct`…) ou **`utm_source`** (les assistants IA arrivent avec leur nom, voir `plans/mesures/outil/src/origines.ts`).
5. Une version récente d'Umami propose un **filtre par étape** (propriété = valeur) : c'est ce qui sépare `cta_click` / `where` = `cta_inscription`, ou `card_click` / `origin`. Sans ce filtre, créer l'entonnoir sans la valeur (l'étape compte alors toutes les valeurs de la propriété) et lire la répartition dans **Événements > Propriétés**.

Une visiteuse est reconnue sans cookie, par un jeton calculé à partir de son adresse, de son agent et d'un sel qu'Umami renouvelle : selon la version de l'instance, la reconnaissance tient de la visite au mois, et se perd quand l'adresse change (réseau mobile, wifi). Les fenêtres ci-dessous sont des durées plausibles ; une fenêtre plus longue rattrape les gens qui reviennent le soir, au prix de quelques mélanges. À vérifier sur l'instance au premier passage.

### Visiteuse

| Nom | Fenêtre | Étapes (dans l'ordre) |
|---|---|---|
| V1 Recherche vers contact | 60 min | 1. Événement `search_submit` ; 2. Événement `search_result_click` ; 3. Événement `profile_view` ; 4. Événement `contact_click` |
| V2 Recherche vers devis | 120 min | 1. `search_submit` ; 2. `search_result_click` ; 3. `profile_view` ; 4. `devis_click` ; 5. `quote_submit` ; 6. `demande_envoyee` |
| V3 Découverte sans recherche vers contact | 60 min | 1. Événement `card_click` (filtre par étape sur `origin` : `mise_en_avant`, `zone`, `talent`, `plus_consultees`, `classement`, `blog`) ; 2. `profile_view` ; 3. `contact_click` |
| V4 Accueil vers contact | 60 min | 1. Page vue `/` ; 2. `search_submit` ; 3. `profile_view` ; 4. `contact_click` |
| V5 Devis, là où elle s'arrête | 60 min | 1. `devis_click` ; 2. `quote_submit` ; 3. `demande_envoyee`. Les échecs se lisent dans **Événements > `quote_error` > Propriétés > `cause`** |

Les recherches sans résultat : **Événements > `search_submit` > Propriétés > `results` = `0`**, et `zone` donne les départements où l'offre manque. Les filtres utilisés : **`search_refine` > `specialty`, `budget`, `sort`**.

### Maquilleuse

| Nom | Fenêtre | Étapes |
|---|---|---|
| M1 Page « Pourquoi rejoindre » vers inscription | 60 min | 1. Page vue `/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse` ; 2. Événement `cta_click` (filtre `where` = `cta_inscription`) ; 3. Page vue `/auth/signup` ; 4. Événement `signup_start` |
| M2 Partenariats vers inscription | 60 min | 1. Page vue `/maquilleuse/partenariats` ; 2. Page vue `/auth/signup` ; 3. `signup_start` |
| M3 Du début d'inscription au profil publié | 10 080 min (7 jours) | 1. `signup_start` ; 2. `signup_wall` ; 3. `email_confirmed` ; 4. `account_arrival` ; 5. `profile_publiable` ; 6. `profile_indexable` (avant le 27/10/2026, `onboarding_step` `identite` et `termine` s'insérait avant `profile_publiable`) |
| M4 Les cinq étapes de l'accueil (retiré le 27/10/2026) | 1 440 min (1 jour) | Plus alimenté : `onboarding_step` n'est plus émis. Lire les séries d'avant seulement |

`signup_wall` compte des demandes d'inscription (la même page pour une adresse neuve et pour une adresse déjà inscrite) : l'écart avec `email_confirmed` mélange donc les adresses jamais confirmées et celles qui avaient déjà un compte. « Profil vérifié » n'a pas d'événement (voir plus haut).

### Contenu

| Nom | Fenêtre | Étapes |
|---|---|---|
| C1 Liste vers lecture | 60 min | 1. Page vue `/blog` ; 2. Page vue `/blog/*` ; 3. `article_depth_50` ; 4. `article_depth_90` |
| C2 Lecture vers action | 60 min | 1. `article_depth_50` ; 2. Événement `cta_click` (filtre `page` = `/blog/[slug]`) ; 3. `search_submit` |
| C3 Lecture vers lien ou partage | 60 min | 1. `article_depth_50` ; 2. `article_link_click` (ou `share_click`) |

Les liens cassés : **Événements > `not_found` > Propriétés > `path`** (et `kind`). L'origine des erreurs de rendu : **`app_error` > `route`**.
