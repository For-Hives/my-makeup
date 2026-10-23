# La suite complète du périmètre de parité (ticket 176)

Ce document range chaque test nommé du plan de tests (`plans/02-plan-tests.md`, §7 : 255 tests) dans un état, et dit où se lit la preuve. Il est gardé par `tests/unit/parity-table.test.ts` : un identifiant du plan qui manque, un état inconnu, un test « vert » dont le fichier n'existe pas ou ne porte pas l'identifiant, ou un décompte faux font échouer les tests unitaires.

## Les trois états

| État | Ce que ça veut dire |
|---|---|
| `vert` | Le test existe dans `tests/` de la v3 (le titre ou le commentaire qui le précède porte son identifiant), et la suite entière passe en CI. Les fichiers cités sont les premiers de la liste, pas tous |
| `hors bascule` | Le test n'est pas dans le périmètre de la bascule. Le ticket qui le reprend est nommé, avec la raison |
| `remplacé` | Le test vit sur l'ancien site (`S`, `AF-`, `RG-`). Il est remplacé par les tests de la v3 nommés, et reste sur `main` jusqu'à l'arrêt de l'ancien site (ticket 202) |

Décomptes : **213 verts, 13 hors bascule, 29 remplacés**, soit 255 tests nommés.

## La suite complète, lue sur la tête de `v3`

La suite complète se joue **en CI**, une fois, sur la tête de `v3` : `ci-ok` (qualité, tests unitaires, image Docker, tests d'intégration, essais de bout en bout). Le relevé du 21/10/2026, en lecture seule (`gh run view`) :

| Quoi | Relevé |
|---|---|
| Passage sur la tête du 21/10/2026 (après la correction de `E41`) | CI 39621476151, commit `6106dbe`, **vert**, `ci-ok` vert en 6 min 25 s : le correctif de la fabrique de profils (deux comptes à la fois, retrait de ce qui a été créé si l'un échoue) tient en CI. Le passage précédent, CI 39607132030 sur `4a5176a`, était rouge (un lot de bout en bout sur quatre) pour la cause que la ligne suivante garde : |
| Cause du rouge de 39607132030 | dans le journal : `E41` (45 profils créés par l'application) a ouvert cinq créations de compte à la fois par travailleur, et le serveur n'a que 5 connexions (`CONNECTIONS_MAX`) : « cannot begin transaction: timeout exceeded when trying to connect », réponse 500 ; l'adresse `slug-inconnu` de `I45` a eu le même 500 au même moment (instable, verte au second essai). Les deux relances de `E41` ont échoué sur « email déjà enregistré » : le crochet raté n'avait pas retiré les comptes de son premier essai. Réparé à la racine, sans relancer jusqu'au vert : `buildByApplication` crée deux comptes à la fois et retire ce qu'il a créé quand l'un échoue (`tests/support/profile-factory.ts`). Lu en local sur le banc : `keyword-search` 13 verts, `host-check` vert. Lu aussi en local sur le banc : `keyword-search` 13 verts, `host-check` vert |
| Passage vert précédent | CI 39601115694, commit `169ba7f` (tête de `v3` au 21/10/2026, 14:37 Paris), tous les jobs verts, `ci-ok` en 6 min 47 s. Le passage d'avant, CI 39524638111 sur `10c19b7` (21/10, 02:59 Paris), était vert aussi, et celui d'avant (CI 39436197738 sur `db4cb54`, 20/10) |
| Durée de `ci-ok` | 6 min 25 s de bout en bout sur `6106dbe` (limite des 15 minutes). Les jobs : `qualite` 55 s, `unit` 1 min 11, `build` 1 min 57, `integration` de 4 min 19 à 6 min 14 (selon le lot), `e2e` de 4 min 38 à 6 min 20, `ci-ok` 3 s. Médiane des 36 passages verts précédents de `v3` : 5 min 27 s ; le plus long : 10 min 6 s |
| Tests unitaires | 3 766 verts, 0 en échec (sur `6106dbe`) |
| Tests d'intégration | 2 283 verts (276 + 333 + 1 674), 0 en échec (sur `6106dbe`) |
| Essais de bout en bout | 569 passés (142 + 152 + 132 + 142 + 1 de l'import réel), 0 échec, 0 instable (aucune ligne « flaky » dans le compte rendu de `6106dbe`) |
| `qualite` | Biome, types, garde-fous de la CI (`bun run test:ci-guard`, 459 tests, 0 échec, qui joue C01 à C08), contrôle des noms |
| Tests nommés par le ticket | I45, E31, E73 et E18 sont dans le journal des essais de ce passage, passés (`host-check`, `url-parity`, `artist-pages`, `dashboard-*`, `legacy-sign-in`, `legacy-cookies`). U61 à U64 sont dans les tests unitaires (`redirects`, `profile-url`, `slugs`, `sign-in-return`, `legacy-cookies`) |

### Les tests instables : 2 % au plus

- **Le dernier passage vert (39621476151, `6106dbe`)** : 0 essai instable sur 569. **Celui d’avant (39524638111)** : 0 sur 552. **Le passage d’avant (39436197738)** : 1 essai instable sur 496, soit 0,2 %. C'est l'essai du plan du site (`tests/e2e/sitemap.spec.ts`, « un seul h1, les mêmes pages fixes que le sitemap… ») : il suivait les liens du plan du site, dont les talents et articles qu'un autre essai crée pour lui puis supprime, en même temps (les deux tailles d'écran tournent côte à côte). Un lien supprimé entre la lecture de la page et sa visite répondait 404. **Réparé à la racine** dans ce ticket : l'essai ne suit plus que ses propres contenus et les pages fixes ; il ne relit plus ce que d'autres essais ajoutent un instant.
- **Les cinq derniers passages verts** : 2 instables sur 2 480 essais environ, soit 0,08 %. Le second (passage 39393273152, avant les corrections du ticket 256) était un envoi d'action venu d'une autre origine, coupé (« socket hang up ») ; les quatre passages suivants n'en ont plus.
- Un essai instable est réparé, jamais relancé jusqu'au vert : en CI, `retries: 2` sert à le *voir* dans le compte rendu (« flaky »), et ce compte est relu ici.
- Depuis la fusion de `v3-ci-vert` (15/10, 17:27) : 29 passages sur 23 commits, 25 verts, 2 rouges (tous deux le 16/10) et 2 annulés. Les 18 commits qui ont suivi le 16/10 à 16:48 ont tous eu un passage vert.

### « Requis » : ce qui ne l'est pas encore

`ci-ok` est **vert** sur la tête de `v3`, mais il n'est **pas requis** : au 21/10/2026, `gh api repos/For-Hives/my-makeup/branches/v3/protection` répond 404 (« Branch not protected »), et aucune règle de dépôt n'existe. `ci-ok` tourne et s'affiche, il n'empêche aucune fusion. C'est le ticket 028 (protéger `v3` : `ci-ok` et `CodeQL`), réservé à Andy parce qu'il se règle dans GitHub, pas dans ce dépôt (`docs/qualite.md`, §6). Depuis l'adaptation du ticket 176 du 21/10/2026 (plus de préprod, protection de la branche facultative), le critère se lit « `ci-ok` vert sur la tête de `v3` » : il est rempli sans cette protection, qui reste un geste facultatif d'Andy.

### Les sondes R01 à R06

Elles ne sont pas sous `ci-ok` : elles tournent le lundi à 07:00 par `.github/workflows/sondes.yml`, en lecture seule, contre le site en ligne. Ce workflow n'est pas encore sur la branche par défaut (`main`), si bien que GitHub ne l'a jamais lancé (`gh run list --workflow sondes.yml` : « workflow not found on the default branch »). Leurs cas (la garde, les décisions de chaque sonde) sont verts en unitaire (`tests/unit/probes.test.ts`, qui joue les six contre un faux site). Le premier lancement réel attend la fusion de `v3` dans `main`.

## Ce que le tableau a trouvé (et ce qui a été fait)

- **E21, E23, E24, E27** (modifier, enregistrer, recharger la zone, les formations, les expériences, les offres et leurs options) n'avaient pas d'essai dans un navigateur : l'aller-retour vers la base était en intégration, le comportement du panneau en unitaire, et les tickets 129 à 131 le disaient (« pas d'essai Playwright »). L'essai `tests/e2e/dashboard-lists.spec.ts` est ajouté.
- **U21, U31, U75, I35, E45, E48, E49, E70** n'ont pas de test et ne doivent pas en avoir avant la bascule : ils portent sur le classement par poids de la recherche (ticket 217) et sur le devis natif (ticket 214), tous deux sortis du périmètre. Les deux tickets sont en `needs-info`.
- **E72, P01 à P04** sont « après la bascule » (plan 02 §9). Les quatre pages de vitesse sont tout de même mesurées à la main avant, par le ticket 179 (`docs/mesure/lighthouse.md`).

## Le tableau

<!-- counts: vert 213, hors bascule 13, remplacé 29 -->
<!-- table:start -->
| Id | État | Où | Note |
|---|---|---|---|
| U01 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-progress.test.tsx`, `tests/unit/profile-state.test.ts` (+2) |  |
| U02 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-progress.test.tsx`, `tests/unit/profile-state.test.ts` (+1) |  |
| U03 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-photo.test.ts`, `tests/unit/profile-state.test.ts` (+4) |  |
| U04 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-progress.test.tsx`, `tests/unit/profile-state.test.ts` (+2) |  |
| U05 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-description-panel.test.tsx`, `tests/unit/dashboard-description.test.ts` (+5) |  |
| U06 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-progress.test.tsx`, `tests/unit/profile-state.test.ts` (+1) |  |
| U07 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-progress.test.tsx`, `tests/unit/profile-state.test.ts` (+1) |  |
| U08 | vert | `tests/unit/completeness.test.ts`, `tests/unit/dashboard-progress.test.tsx`, `tests/unit/profile-state.test.ts` (+1) |  |
| U09 | vert | `tests/unit/slugs.test.ts` |  |
| U10 | vert | `tests/unit/slugs.test.ts` |  |
| U11 | vert | `tests/unit/slugs.test.ts` |  |
| U12 | vert | `tests/unit/slugs.test.ts` |  |
| U13 | vert | `tests/unit/profile-url.test.ts`, `tests/unit/slugs.test.ts` |  |
| U14 | vert | `tests/unit/dashboard-location-panel.test.tsx`, `tests/unit/dashboard-location.test.ts`, `tests/unit/format-zone.test.ts` |  |
| U15 | vert | `tests/unit/dashboard-location-panel.test.tsx`, `tests/unit/dashboard-location.test.ts` |  |
| U16 | vert | `tests/unit/dashboard-location-panel.test.tsx`, `tests/unit/dashboard-location.test.ts`, `tests/integration/dashboard-location.test.ts` |  |
| U17 | vert | `tests/unit/search.test.ts` |  |
| U18 | vert | `tests/unit/search-pages.test.ts`, `tests/unit/search.test.ts` |  |
| U19 | vert | `tests/unit/search.test.ts` |  |
| U20 | vert | `tests/unit/public-read.test.ts`, `tests/integration/public-read.test.ts` |  |
| U21 | hors bascule | ticket 217 | le classement par poids n’existe pas (la liste est en sections) ; recherche v2, needs-info |
| U22 | vert | `tests/unit/public-read.test.ts`, `tests/integration/dashboard-networks-contact-details.test.ts`, `tests/unit/search.test.ts` |  |
| U23 | vert | `tests/unit/keyword-search.test.ts` |  |
| U24 | vert | `tests/unit/sign-up.test.ts` |  |
| U25 | vert | `tests/unit/dashboard-identity.test.ts`, `tests/unit/sign-up-form.test.tsx`, `tests/unit/sign-up.test.ts` (+1) |  |
| U26 | vert | `tests/unit/dashboard-identity.test.ts` |  |
| U27 | vert | `tests/unit/dashboard-description-panel.test.tsx`, `tests/unit/dashboard-description.test.ts`, `tests/integration/dashboard-description.test.ts` (+1) |  |
| U28 | vert | `tests/unit/dashboard-contact-details.test.ts`, `tests/unit/dashboard-networks-contact-details-panels.test.tsx`, `tests/unit/dashboard-networks.test.ts` (+2) |  |
| U29 | vert | `tests/unit/dashboard-lists-panels.test.tsx`, `tests/unit/dashboard-lists.test.ts`, `tests/unit/profile-lists.test.ts` (+1) |  |
| U30 | vert | `tests/unit/dashboard-lists-panels.test.tsx`, `tests/unit/dashboard-lists.test.ts`, `tests/unit/profile-lists.test.ts` (+1) |  |
| U31 | hors bascule | ticket 214 | le formulaire de devis n’existe pas (décision du 08/10) ; les cinq champs du contact sont testés en U76 |
| U32 | vert | `tests/unit/dashboard-availability.test.tsx`, `tests/unit/dashboard-description.test.ts`, `tests/unit/dashboard-identity.test.ts` (+5) |  |
| U33 | vert | `tests/unit/price.test.ts` |  |
| U34 | vert | `tests/unit/price.test.ts` |  |
| U35 | vert | `tests/unit/price.test.ts` |  |
| U36 | vert | `tests/unit/price.test.ts` |  |
| U37 | vert | `tests/unit/price.test.ts`, `tests/unit/profile-seo.test.ts` |  |
| U38 | vert | `tests/unit/sitemap.test.ts` |  |
| U39 | vert | `tests/unit/sitemap.test.ts` |  |
| U40 | vert | `tests/unit/sitemap.test.ts` |  |
| U41 | vert | `tests/unit/sitemap.test.ts` |  |
| U42 | vert | `tests/unit/sitemap.test.ts` |  |
| U43 | vert | `tests/unit/sitemap.test.ts` |  |
| U44 | vert | `tests/unit/seo-base.test.ts` |  |
| U45 | vert | `tests/unit/seo-base.test.ts` |  |
| U46 | vert | `tests/unit/seo-base.test.ts` |  |
| U47 | vert | `tests/unit/profile-seo.test.ts` |  |
| U48 | vert | `tests/unit/profile-seo.test.ts` |  |
| U49 | vert | `tests/unit/profile-seo.test.ts` |  |
| U50 | vert | `tests/unit/profile-seo.test.ts`, `tests/unit/seo-base.test.ts`, `tests/unit/home.test.ts` |  |
| U51 | vert | `tests/unit/share-open-graph.test.ts`, `tests/e2e/share-open-graph.spec.ts` |  |
| U52 | vert | `tests/unit/seo-base.test.ts` |  |
| U53 | vert | `tests/unit/access.test.ts`, `tests/integration/profile-public-read.test.ts`, `tests/integration/payload-access.test.ts` |  |
| U54 | vert | `tests/unit/access.test.ts`, `tests/integration/dashboard-identity.test.ts`, `tests/e2e/dashboard-profile.spec.ts` (+1) |  |
| U55 | vert | `tests/unit/access.test.ts`, `tests/integration/profile-public-read.test.ts`, `tests/integration/payload-access.test.ts` |  |
| U56 | vert | `tests/unit/access.test.ts`, `tests/integration/media-read.test.ts`, `tests/integration/payload-access.test.ts` |  |
| U57 | vert | `tests/unit/access.test.ts`, `tests/integration/payload-access.test.ts` |  |
| U58 | vert | `tests/integration/payload-access.test.ts` | adapté : les messages de contact |
| U59 | vert | `tests/unit/access.test.ts`, `tests/integration/articles.test.ts`, `tests/integration/profile-contact.test.ts` (+1) |  |
| U60 | vert | `tests/unit/bounded-query.test.ts`, `tests/integration/bounded-queries.test.ts` |  |
| U61 | vert | `tests/unit/profile-url.test.ts`, `tests/unit/slugs.test.ts`, `tests/unit/cutover-host-check.test.ts` (+1) |  |
| U62 | vert | `tests/unit/redirects.test.ts`, `tests/e2e/blog-list.spec.ts`, `tests/unit/cutover-host-check.test.ts` (+1) |  |
| U63 | vert | `tests/unit/sign-in-return.test.ts`, `tests/unit/cutover-host-check.test.ts`, `tests/e2e/host-check.spec.ts` |  |
| U64 | vert | `tests/unit/legacy-cookies.test.ts`, `tests/unit/redirects.test.ts`, `tests/unit/cutover-host-check.test.ts` (+1) |  |
| U65 | vert | `tests/unit/legacy-cookies.test.ts` |  |
| U66 | vert | `tests/unit/legacy-cookies.test.ts` |  |
| U67 | vert | `tests/unit/sliding-session.test.tsx` |  |
| U68 | vert | `tests/unit/sliding-session.test.tsx` |  |
| U69 | vert | `tests/unit/expired-session.test.ts` |  |
| U70 | vert | `tests/unit/expired-session.test.ts` |  |
| U71 | vert | `tests/unit/dashboard-closed.test.ts` |  |
| U72 | vert | `tests/unit/legacy-sign-in.test.ts` |  |
| U73 | vert | `tests/unit/legacy-sign-in.test.ts` |  |
| U74 | vert | `tests/unit/legacy-sign-in.test.ts` |  |
| U75 | hors bascule | ticket 214 | routage d’une demande vers la maquilleuse choisie |
| U76 | vert | `tests/unit/contact-message.test.ts` | adapté : le mail à l’équipe |
| U77 | vert | `tests/unit/contact-rate-limit.test.ts` |  |
| U78 | vert | `tests/unit/contact-statuses.test.ts` |  |
| U79 | vert | `tests/unit/dashboard-photo.test.ts`, `tests/unit/photo-upload.test.ts`, `tests/integration/photo-upload.test.ts` |  |
| U80 | vert | `tests/unit/dashboard-portfolio-panel.test.tsx`, `tests/unit/photo-upload.test.ts`, `tests/integration/dashboard-portfolio.test.ts` (+4) |  |
| U81 | vert | `tests/unit/photo-upload.test.ts`, `tests/integration/photo-upload.test.ts` |  |
| U82 | vert | `tests/unit/analytics-dashboard.test.tsx`, `tests/unit/analytics-events.test.ts`, `tests/unit/analytics-auth.test.tsx` |  |
| U83 | vert | `tests/unit/analytics-events.test.ts`, `tests/unit/analytics-auth.test.tsx` |  |
| U84 | vert | `tests/unit/analytics-contact-click.test.tsx`, `tests/e2e/analytics-contact-click.spec.ts` |  |
| U85 | vert | `tests/unit/test-guard.test.ts` |  |
| U86 | vert | `tests/unit/bench-e2e.test.ts`, `tests/unit/probes.test.ts`, `tests/unit/test-guard.test.ts` (+1) |  |
| U87 | vert | `tests/unit/test-guard.test.ts` |  |
| I01 | vert | `tests/integration/profile-contact.test.ts`, `tests/integration/profile-public-read.test.ts`, `tests/integration/payload-access.test.ts` |  |
| I02 | vert | `tests/integration/dashboard-availability.test.ts`, `tests/integration/dashboard-bullets.test.ts`, `tests/integration/dashboard-description.test.ts` (+6) |  |
| I03 | vert | `tests/integration/dashboard-identity.test.ts`, `tests/integration/profile-public-read.test.ts`, `tests/integration/dashboard-networks-contact-details.test.ts` (+1) |  |
| I04 | vert | `tests/unit/access.test.ts`, `tests/integration/media-read.test.ts`, `tests/integration/payload-access.test.ts` |  |
| I05 | vert | `tests/unit/payload-config.test.ts`, `tests/e2e/api-graphql.spec.ts` |  |
| I06 | vert | `tests/integration/pro-accounts.test.ts`, `tests/integration/payload-access.test.ts` |  |
| I07 | vert | `tests/integration/profile-contact.test.ts`, `tests/integration/payload-access.test.ts` |  |
| I08 | vert | `tests/integration/auth-sign-up.test.ts` |  |
| I09 | vert | `tests/unit/cookies-session.test.ts`, `tests/integration/auth-sign-in.test.ts` |  |
| I10 | vert | `tests/integration/auth-forgot-password.test.ts` |  |
| I11 | vert | `tests/integration/auth-sign-out.test.ts` |  |
| I12 | vert | `tests/integration/auth-expired-session.test.ts` |  |
| I13 | vert | `tests/integration/auth-sign-out.test.ts` |  |
| I14 | vert | `tests/integration/auth-sign-in.test.ts` |  |
| I15 | vert | `tests/integration/auth-legacy-sign-in.test.ts` |  |
| I16 | vert | `tests/integration/auth-sliding-session.test.ts` |  |
| I17 | vert | `tests/integration/auth-forgot-password.test.ts` |  |
| I18 | vert | `tests/integration/payload-hooks.test.ts` |  |
| I19 | vert | `tests/integration/dashboard-identity.test.ts`, `tests/integration/payload-hooks.test.ts`, `tests/integration/dashboard-location.test.ts` |  |
| I20 | vert | `tests/integration/dashboard-progress.test.ts`, `tests/integration/profile-completeness.test.ts`, `tests/e2e/dashboard-progress.spec.ts` |  |
| I21 | vert | `tests/unit/revalidate.test.ts`, `tests/integration/revalidate.test.ts`, `tests/e2e/page-freshness.spec.ts` |  |
| I22 | vert | `tests/integration/migrations.test.ts`, `tests/unit/migration-init.test.ts` |  |
| I23 | vert | `tests/integration/photo-upload.test.ts` |  |
| I24 | vert | `tests/unit/dashboard-photo.test.ts`, `tests/integration/dashboard-photo.test.ts`, `tests/integration/media-trash.test.ts` (+2) |  |
| I25 | vert | `tests/integration/dashboard-portfolio.test.ts`, `tests/integration/media-trash.test.ts` |  |
| I26 | vert | `tests/integration/photo-upload.test.ts` |  |
| I27 | vert | `tests/unit/reconciliation.test.ts`, `tests/integration/reconciliation.test.ts` |  |
| I28 | vert | `tests/integration/search.test.ts` |  |
| I29 | vert | `tests/integration/search.test.ts`, `tests/e2e/keyword-search.spec.ts` |  |
| I30 | vert | `tests/unit/search-pages.test.ts`, `tests/e2e/keyword-search.spec.ts`, `tests/integration/search.test.ts` |  |
| I31 | vert | `tests/integration/search.test.ts` |  |
| I32 | vert | `tests/unit/contact-send.test.ts`, `tests/integration/contact.test.ts` | adapté : le message de contact |
| I33 | vert | `tests/unit/contact-send.test.ts`, `tests/integration/contact.test.ts` | adapté : le message de contact |
| I34 | vert | `tests/integration/contact.test.ts` |  |
| I35 | hors bascule | ticket 214 | lien signé « J’ai répondu » |
| I36 | vert | `tests/integration/dashboard-deletion.test.ts`, `tests/integration/admin-account-deletion.test.ts` |  |
| I37 | vert | `tests/integration/admin-account-deletion.test.ts` |  |
| I38 | vert | `tests/integration/dashboard-deletion.test.ts` |  |
| I39 | vert | `tests/unit/import-media.test.ts`, `tests/integration/import-accounts.test.ts`, `tests/integration/import-articles.test.ts` (+5) |  |
| I40 | vert | `tests/integration/import-articles.test.ts`, `tests/integration/import-check.test.ts`, `tests/integration/import-profile-sections.test.ts` (+1) |  |
| I41 | vert | `tests/integration/import-accounts.test.ts`, `tests/integration/import-profiles.test.ts` |  |
| I42 | vert | `tests/integration/import-media.test.ts` |  |
| I43 | vert | `tests/integration/import-check.test.ts`, `tests/integration/import-talents.test.ts`, `tests/integration/import-then-sign-in.test.ts` (+1) |  |
| I44 | vert | `tests/integration/import-accounts.test.ts` |  |
| I45 | vert | `tests/unit/cutover-host-check.test.ts`, `tests/unit/talent-titles.test.ts`, `tests/e2e/artist-pages.spec.ts` (+6) |  |
| E01 | vert | `tests/e2e/sign-up.spec.ts` | adapté |
| E02 | vert | `tests/integration/dashboard-onboarding.test.ts`, `tests/e2e/dashboard-onboarding.spec.ts`, `tests/unit/dashboard-onboarding-panel.test.tsx` (+1) |  |
| E03 | vert | `tests/integration/auth-sign-up-email-taken.test.ts`, `tests/e2e/sign-up.spec.ts` |  |
| E04 | vert | `tests/integration/auth-sign-up-email-taken.test.ts`, `tests/e2e/sign-up.spec.ts` |  |
| E05 | vert | `tests/e2e/sign-in.spec.ts` |  |
| E06 | vert | `tests/e2e/sign-in.spec.ts` |  |
| E07 | vert | `tests/integration/auth-google.test.ts`, `tests/e2e/google-sign-in.spec.ts` |  |
| E08 | vert | `tests/e2e/forgot-password.spec.ts`, `tests/integration/auth-forgot-password.test.ts` |  |
| E09 | vert | `tests/e2e/private-dashboard.spec.ts`, `tests/e2e/sign-in.spec.ts` |  |
| E10 | vert | `tests/e2e/sign-out.spec.ts` |  |
| E11 | vert | `tests/e2e/sign-out.spec.ts` |  |
| E12 | vert | `tests/unit/analytics-auth.test.tsx`, `tests/e2e/expired-session.spec.ts` |  |
| E13 | vert | `tests/e2e/expired-session.spec.ts` |  |
| E14 | vert | `tests/e2e/sliding-session.spec.ts` |  |
| E15 | vert | `tests/e2e/forgot-password.spec.ts`, `tests/integration/auth-forgot-password.test.ts` |  |
| E16 | vert | `tests/e2e/private-dashboard.spec.ts`, `tests/e2e/dashboard-profile.spec.ts` |  |
| E17 | vert | `tests/e2e/sign-out.spec.ts` |  |
| E18 | vert | `tests/e2e/legacy-cookies.spec.ts` |  |
| E19 | vert | `tests/e2e/dashboard-profile.spec.ts`, `tests/unit/dashboard-availability.test.tsx` | section : l’identité |
| E20 | vert | `tests/e2e/dashboard-description.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : la description |
| E21 | vert | `tests/e2e/dashboard-lists.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : la zone |
| E22 | vert | `tests/e2e/dashboard-bullets.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : les compétences |
| E23 | vert | `tests/e2e/dashboard-lists.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : les formations |
| E24 | vert | `tests/e2e/dashboard-lists.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : les expériences |
| E25 | vert | `tests/e2e/dashboard-bullets.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : les langues |
| E26 | vert | `tests/e2e/dashboard-networks-contact-details.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : les réseaux et les coordonnées |
| E27 | vert | `tests/e2e/dashboard-lists.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : les offres et leurs options |
| E28 | vert | `tests/e2e/dashboard-availability.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : la disponibilité |
| E29 | vert | `tests/e2e/dashboard-photo.spec.ts`, `tests/integration/dashboard-availability.test.ts` | section : la photo principale |
| E30 | vert | `tests/unit/dashboard-bullets-panel.test.tsx`, `tests/unit/dashboard-bullets.test.ts`, `tests/unit/dashboard-location-panel.test.tsx` (+9) |  |
| E31 | vert | `tests/unit/dashboard-bullets-panel.test.tsx`, `tests/unit/dashboard-description-panel.test.tsx`, `tests/unit/dashboard-lists-panels.test.tsx` (+10) |  |
| E32 | vert | `tests/unit/dashboard-panel.test.tsx`, `tests/e2e/dashboard-profile.spec.ts` |  |
| E33 | vert | `tests/e2e/dashboard-deletion.spec.ts`, `tests/unit/dashboard-deletion.test.tsx`, `tests/integration/dashboard-deletion.test.ts` |  |
| E34 | vert | `tests/unit/dashboard-portfolio-panel.test.tsx`, `tests/integration/dashboard-portfolio.test.ts`, `tests/e2e/dashboard-portfolio.spec.ts` |  |
| E35 | vert | `tests/unit/dashboard-portfolio-panel.test.tsx`, `tests/integration/dashboard-portfolio.test.ts`, `tests/e2e/dashboard-portfolio.spec.ts` |  |
| E36 | vert | `tests/unit/dashboard-photo-panel.test.tsx`, `tests/unit/dashboard-photo.test.ts`, `tests/unit/dashboard-portfolio-panel.test.tsx` (+4) |  |
| E37 | vert | `tests/e2e/dashboard-acceptance.spec.ts` |  |
| E38 | vert | `tests/e2e/city-search.spec.ts` |  |
| E39 | vert | `tests/e2e/keyword-search.spec.ts` | adapté |
| E40 | vert | `tests/e2e/keyword-search.spec.ts` |  |
| E41 | vert | `tests/unit/search-pages.test.ts`, `tests/e2e/keyword-search.spec.ts` |  |
| E42 | vert | `tests/e2e/city-search.spec.ts` |  |
| E43 | vert | `tests/unit/public-profile.test.tsx`, `tests/e2e/public-profile.spec.ts` |  |
| E44 | vert | `tests/unit/profile-gallery.test.tsx`, `tests/unit/public-profile.test.tsx`, `tests/e2e/public-profile.spec.ts` |  |
| E45 | hors bascule | ticket 214 | le formulaire de devis sur le profil |
| E46 | vert | `tests/e2e/public-profile.spec.ts` |  |
| E47 | vert | `tests/e2e/public-profile.spec.ts` |  |
| E48 | hors bascule | ticket 214 | « Afficher le téléphone » et `contact_reveal` |
| E49 | hors bascule | ticket 214 | la demande de devis d’une cliente |
| E50 | vert | `tests/e2e/contact.spec.ts` |  |
| E51 | vert | `tests/unit/contact-form.test.tsx`, `tests/e2e/contact.spec.ts` |  |
| E52 | vert | `tests/e2e/analytics-contact-click.spec.ts`, `tests/unit/analytics-contact-click.test.tsx` |  |
| E53 | vert | `tests/e2e/admin-messages-contact.spec.ts`, `tests/e2e/admin-profiles.spec.ts` |  |
| E54 | vert | `tests/e2e/admin-refuse-artist.spec.ts` |  |
| E55 | vert | `tests/e2e/admin-editor.spec.ts`, `tests/e2e/admin-messages-contact.spec.ts` |  |
| E56 | vert | `tests/e2e/admin-profiles.spec.ts` |  |
| E57 | vert | `tests/e2e/admin-account-deletion.spec.ts` |  |
| E58 | vert | `tests/integration/contact-admin.test.ts`, `tests/e2e/admin-messages-contact.spec.ts` |  |
| E59 | vert | `tests/e2e/blog-article.spec.ts`, `tests/e2e/talent.spec.ts`, `tests/e2e/errors.spec.ts` |  |
| E60 | vert | `tests/unit/error-pages.test.tsx`, `tests/e2e/errors.spec.ts` |  |
| E61 | vert | `tests/e2e/errors.spec.ts` |  |
| E62 | vert | `tests/e2e/sitemap.spec.ts`, `tests/unit/sitemap.test.ts` |  |
| E63 | vert | `tests/unit/seo-base.test.ts`, `tests/e2e/seo-base.spec.ts` |  |
| E64 | vert | `tests/e2e/artist-pages.spec.ts`, `tests/e2e/blog-list.spec.ts`, `tests/e2e/home.spec.ts` (+2) |  |
| E65 | vert | `tests/unit/blog-article.test.ts`, `tests/e2e/blog-article.spec.ts`, `tests/e2e/profile-seo.spec.ts` (+2) |  |
| E66 | vert | `tests/e2e/public-profile.spec.ts` |  |
| E67 | vert | `tests/e2e/dashboard-acceptance.spec.ts`, `tests/e2e/a11y-key-pages.spec.ts` |  |
| E68 | vert | `tests/unit/dashboard-panel.test.tsx`, `tests/e2e/dashboard-acceptance.spec.ts`, `tests/e2e/dashboard-profile.spec.ts` (+1) |  |
| E69 | vert | `tests/unit/contact-form.test.tsx`, `tests/e2e/contact.spec.ts` |  |
| E70 | hors bascule | ticket 214 | le parcours mobile avec demande de devis |
| E71 | vert | `tests/e2e/layout.spec.ts` |  |
| E72 | hors bascule | ticket 199 | références visuelles, après la bascule |
| E73 | vert | `tests/e2e/legacy-sign-in.spec.ts`, `tests/integration/auth-legacy-sign-in.test.ts` |  |
| E74 | vert | `tests/integration/auth-passwordless-accounts.test.ts`, `tests/e2e/passwordless-accounts.spec.ts` |  |
| P01 | hors bascule | ticket 199 | mesuré à la main avant la bascule (ticket 179, `bun run perf:lighthouse`) ; la CI le surveille après |
| P02 | hors bascule | ticket 199 | id. |
| P03 | hors bascule | ticket 199 | id. |
| P04 | hors bascule | ticket 199 | id. |
| R01 | vert | `tests/unit/probes.test.ts`, `tests/probes/guard.ts`, `tests/probes/probes.ts` | la garde et chaque sonde, en unitaire ; le lancement réel du lundi attend `sondes.yml` sur `main` |
| R02 | vert | `tests/unit/probes.test.ts`, `tests/probes/guard.ts`, `tests/probes/probes.ts` (+1) | la garde et chaque sonde, en unitaire ; le lancement réel du lundi attend `sondes.yml` sur `main` |
| R03 | vert | `tests/unit/probes.test.ts`, `tests/unit/probes-monday-ci.test.ts`, `tests/probes/content.ts` (+1) | la garde et chaque sonde, en unitaire ; le lancement réel du lundi attend `sondes.yml` sur `main` |
| R04 | vert | `tests/unit/probes.test.ts`, `tests/probes/probes.ts` | la garde et chaque sonde, en unitaire ; le lancement réel du lundi attend `sondes.yml` sur `main` |
| R05 | vert | `tests/unit/probes.test.ts`, `tests/probes/headers.ts`, `tests/probes/probes.ts` | la garde et chaque sonde, en unitaire ; le lancement réel du lundi attend `sondes.yml` sur `main` |
| R06 | vert | `tests/unit/probes.test.ts`, `tests/probes/certificates.ts`, `tests/probes/probes.ts` | la garde et chaque sonde, en unitaire ; le lancement réel du lundi attend `sondes.yml` sur `main` |
| C01 | vert | `tests/ci/ci-guardrails.test.ts`, `tests/ci/publication.test.ts` |  |
| C02 | vert | `tests/ci/ci-guardrails.test.ts`, `tests/ci/publication.test.ts` |  |
| C03 | vert | `tests/ci/ci-guardrails.test.ts`, `tests/ci/publication.test.ts` |  |
| C04 | vert | `tests/ci/ci-guardrails.test.ts`, `tests/ci/renovate.test.ts` |  |
| C05 | vert | `tests/ci/ci-guardrails.test.ts`, `tests/ci/canary.test.ts` |  |
| C06 | vert | `tests/ci/ci-guardrails.test.ts`, `tests/ci/canary.test.ts` |  |
| C07 | vert | `tests/ci/ci-guardrails.test.ts`, `tests/ci/canary.test.ts` |  |
| C08 | vert | `tests/ci/ci-guardrails.test.ts` |  |
| S01 | remplacé | I04 | l’API qui liste les fichiers est fermée à l’anonyme ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S02 | remplacé | I06 | aucune route ne liste les comptes ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S03 | remplacé | U53 à U60, I01 à I07 | la matrice d’accès remplace la liste blanche de permissions ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S04 | remplacé | I01, U22 | ni email ni téléphone sans le choix de la maquilleuse ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S05 | remplacé | I03, U55 | `status`, `verified`, `score`, `pro` ignorés ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S06 | remplacé | I06 | jamais de mot de passe ni de jeton dans une réponse ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S07 | remplacé | I36, E33 | suppression du compte et de tout ce qui lui est lié ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S08 | remplacé | U60, I01 | filtre sur un champ privé refusé ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S09 | remplacé | I28, I29, I30 | recherche : 20 par page, aucune coordonnée, frein à 60 par minute ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S10 | remplacé | — | sans objet dans la v3 : l’application et son API ont la même origine, il n’y a plus de CORS ; les en-têtes de sécurité ont leur test (`tests/unit/security-headers.test.ts`) ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S11 | remplacé | I14, E06 | mauvais mot de passe lisible ; frein par adresse ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S12 | remplacé | I10 | réponse identique que l’email existe ou non ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| S13 | remplacé | U79, I26, E36 | SVG, AVIF, PDF et 12 Mo refusés ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-01 | remplacé | U70 | une panne ne déconnecte pas ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-02 | remplacé | U70, E11 | un refus du serveur ferme la session ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-03 | remplacé | E12 | une seule redirection, pas de boucle ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-04 | remplacé | U67, I12 | la durée de la session suit celle du jeton ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-05 | remplacé | — | sans objet dans la v3 : la session n’est plus revalidée auprès d’un autre service à chaque requête ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-06 | remplacé | E06, I14 | mauvais mot de passe sans exception ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-07 | remplacé | E03, I08 | adresse déjà prise, message neutre ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-08 | remplacé | I14, E05 | frein ; erreurs de la connexion Google (`tests/unit/google-errors.test.ts`) ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-09 | remplacé | I11, E10 | la déconnexion répond et ne laisse rien ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| AF-10 | remplacé | E16, U71 | ni jeton dans le HTML ni cache partagé ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| RG-01 | remplacé | E31 | échec du serveur : valeur inchangée et message ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| RG-02 | remplacé | E30, U26 | bornes des noms ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| RG-03 | remplacé | E31 | fermer sans enregistrer : valeur d’origine ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| RG-04 | remplacé | E34, E36, U80, U81 | aucun orphelin ; photo lourde ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| RG-05 | remplacé | E68, E71 | le premier tap ouvre le panneau ; le bouton « Modifier » au focus ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| RG-08 | remplacé | E12 | session expirée : une redirection, le message ; reste sur `main` jusqu’à l’arrêt de l’ancien site (ticket 202) |
| RG-06 | vert | `tests/e2e/dashboard-preview.spec.ts`, `tests/unit/dashboard-preview.test.tsx` | repris tel quel |
| RG-07 | vert | `tests/e2e/dashboard-onboarding.spec.ts`, `tests/unit/dashboard-onboarding-panel.test.tsx` | repris tel quel |
<!-- table:end -->
