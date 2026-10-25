# L'invitation à l'action du bas des pages (issue 1067)

Le bloc `src/components/blocks/Cta.tsx` ferme treize pages publiques : l'accueil, les pages fixes, un article, un talent, une page de zone, le plan du site. Deux invitations : « Trouver ma maquilleuse » (vers `/search`) et « Je suis maquilleuse » (vers `/auth/signup`). Les valeurs de mesure de leurs clics (`cta_click`, `where` : `cta_recherche`, `cta_inscription`) n'ont pas changé.

## Direction artistique (refonte du 25/10/2026)

`Cta` n'est plus qu'un habillage : il donne ses mots et ses deux clics mesurés à `ArtCta` (`src/components/art/ArtCta.tsx`, [`direction-artistique.md`](direction-artistique.md)) : cadre blanc, grand panneau `art-night`, titre en Bodoni (un mot en italique), deux pilules de 52 px, 144 px d'air au-dessus et au-dessous du panneau sur ordinateur, lueurs diffuses autour. Le fond (statique, puis le shader) est le même `CtaBackdrop`. Ce qui suit sur le cadre indigo, les boutons `rounded-lg` et `min-h-12` décrit l'ancien bloc ; le fond, la dépendance et le budget valent toujours.

### Ancien cadre (avant la refonte)

Celle du site public : un cadre arrondi (`rounded-2xl`) en `indigo-900`, du texte blanc, des boutons `rounded-lg` en gras, comme les boutons du site. Aucune couleur ni police de l'espace de la maquilleuse (rouge à lèvres, Bodoni, Instrument Sans). Le site n'a pas de thème sombre : ni `next-themes`, ni variante.

Les boutons font 48 px de haut (`min-h-12`), montrent leur focus (contour blanc décalé) et ne dépendent pas du fond.

## Le fond

Deux couches (`CtaBackdrop.tsx`) :

1. **Statique**, toujours là : deux dégradés en CSS (`.cta-backdrop-static`, `globals.css`). C'est tout ce qu'il y a sans JavaScript, sans WebGL et avec `prefers-reduced-motion: reduce`.
2. **Le shader** `NeuroNoise` (`CtaShader.tsx`), ajouté par-dessus seulement quand le bloc approche de l'écran (`IntersectionObserver`, marge de 200 px) et que la visiteuse n'a pas demandé moins de mouvement. Quand le bloc sort de l'écran, le shader est démonté : son contexte WebGL est libéré. Le choix est une fonction pure testée (`backdropMode`).

Les couleurs du fond (`cta-palette.ts`) sont des indigos qui tiennent 4,5:1 sous du texte blanc, du plus foncé (11,5:1) au plus clair (4,57:1) : le texte se lit sur le pire pixel de l'animation. Un test le garde.

## Budget du shader (écrit dans l'issue avant le code)

| Critère | Budget | Mesure du 24/10/2026 |
|---|---|---|
| Poids différé | au plus 10 Ko gzip, chargé à l'approche du bloc | 9,6 Ko gzip (27 Ko brut) en trois morceaux |
| JavaScript du premier chargement | 0 octet de plus | voir la comparaison avant/après dans la PR |
| LCP, CLS | aucun impact | le bloc est en bas de page, sa taille est fixée par le cadre : CLS 0 |
| Mouvement réduit, sans WebGL | aucun shader | essai de bout en bout : `data-backdrop="static"`, aucun morceau chargé |

Si une de ces lignes sort du cadre, le shader est retiré et le fond statique reste. Rien d'autre à changer : le composant le prévoit.

## La dépendance

`@paper-design/shaders-react` 0.0.81 (et `@paper-design/shaders` 0.0.81, sa dépendance exacte), publiées le 17/09/2026. La 0.0.82 (21/10/2026) a moins de 7 jours : elle n'est pas prise. Aucun script d'installation, licence Apache-2.0, aucun avis dans la base de GitHub (GraphQL `securityVulnerabilities`) pour les deux paquets, aucun avis dans le dépôt `paper-design/shaders` (`security-advisories` vide), le 24/10/2026. Ni `lucide-react` (la flèche est dessinée dans `icons.tsx`), ni `class-variance-authority`, `@radix-ui/react-slot`, `clsx`, `tailwind-merge` : les boutons du site s'écrivent déjà en classes Tailwind, donc la structure shadcn (`components.json`, `lib/utils.ts`, `components/ui`) n'est pas créée : rien ne la demande.

## Tests

`tests/unit/call-to-action.test.tsx` (le bloc), `tests/unit/call-to-action-backdrop.test.tsx` (le choix du fond, le contraste, le morceau différé, le composant sous mouvement réduit), `tests/unit/public-client-graph.test.ts` (qui suit désormais `components/blocks`).
