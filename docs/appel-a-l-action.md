# L'invitation à l'action du bas des pages (issue 1067)

Le bloc `src/components/blocks/Cta.tsx` ferme treize pages publiques : l'accueil, les pages fixes, un article, un talent, une page de zone, le plan du site. Deux invitations : « Trouver ma maquilleuse » (vers `/search`) et « Je suis maquilleuse » (vers `/auth/signup`). Les valeurs de mesure de leurs clics (`cta_click`, `where` : `cta_recherche`, `cta_inscription`) n'ont pas changé.

## Direction artistique (refonte du 25/10/2026)

`Cta` n'est plus qu'un habillage : il donne ses mots et ses deux clics mesurés à `ArtCta` (`src/components/art/ArtCta.tsx`, [`direction-artistique.md`](direction-artistique.md)) : grand panneau `art-night` posé **directement sur le fond de la page** (plus de cadre blanc : il faisait une grosse barre blanche autour du panneau, retour d'Andy du 25/10/2026), titre en Bodoni (un mot en italique), deux pilules de 52 px. Le fond (statique, puis le shader) est le même `CtaBackdrop`. Ce qui suit sur le cadre indigo, les boutons `rounded-lg` et `min-h-12` décrit l'ancien bloc ; le fond, la dépendance et le budget valent toujours.

## Plus de décor, le cadre du site, un titre plus léger (27/10/2026)

Retour d'Andy : « virer les dessins SVG qui sont tout autour », que le bloc prenne la largeur des blocs du dessus, et un titre moins énorme.

- **Aucun décor.** Ni les lueurs diffuses autour du panneau, ni les dessins au trait (lèvres), ni le pinceau, ni les marques d'impression (plus, rond). Il reste le vrai fond (`CtaBackdrop` : dégradés, puis shader) et les deux boutons. `tests/unit/art-components.test.tsx` refuse tout `<svg` et toute lueur dans le bloc.
- **Le cadre du site.** Le panneau est dans `page-frame` (96rem au plus, gouttière de 24 px, 64 px dès 64rem), comme le contenu des sections du dessus : il s'aligne bord à bord avec elles sur ordinateur et a la même gouttière sur téléphone. Plus de `max-w-6xl` ni de `mx-auto` propre (la liste des cadres à part de `tests/unit/page-frame.test.ts` ne garde plus `ArtCta`).
- **Plus léger.** Titre de 2rem sur téléphone, 2,25rem dès 640 px, 3,25rem (52 px) dès 1024 px, au lieu de 5rem (80 px), sur 24 caractères de large au lieu de 16 ; phrase en `text-lg` au lieu de `text-xl` ; air dans le panneau `md:py-24` (96 px) au lieu de `md:py-44`, `md:px-16` au lieu de `md:px-24` ; 80 px d'air autour du panneau (`md:py-20`) au lieu de 144. Le titre reste en Bodoni, le texte reste blanc (contraste gardé par `tests/unit/art-tokens.test.ts`).
### Ancien cadre (avant la refonte)

Celle du site public : un cadre arrondi (`rounded-2xl`) en `indigo-900`, du texte blanc, des boutons `rounded-lg` en gras, comme les boutons du site. Aucune couleur ni police de l'espace de la maquilleuse (rouge à lèvres, Bodoni, Instrument Sans). Le haut de l'accueil, lui, prend l'encre, le rouge à lèvres et Bodoni Moda depuis la décision d'Andy du 25/10/2026 ([`accueil.md`](accueil.md)) : l'invitation reste indigo jusqu'à l'harmonisation des sections sous le haut de page. Le site n'a pas de thème sombre : ni `next-themes`, ni variante.

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
