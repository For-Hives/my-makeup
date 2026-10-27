# Le gabarit des courriels aux maquilleuses (React Email)

Un gabarit visuel pour écrire à toutes les maquilleuses (reprise du projet, grosse mise à jour). **Le design est fait ; le texte de `src/emails/annonce-maquilleuses.tsx` est celui du mainteneur, orthographe corrigée**. Son numéro et son adresse personnelle ne sont pas dans le dépôt (public) : variables `ANNONCE_PHONE` et `ANNONCE_EMAIL` de la machine qui rend ou envoie. Rien n'est envoyé par ce gabarit.

## Où

- `src/emails/components/MakeupMail.tsx` : l'enveloppe (logo et nom, bandeau indigo, eyebrow, titre en Bodoni avec **un seul mot en italique baie**, filet, corps, bouton en pilule encre, signature, cadre rose avec cinq dessins au trait, pied de page avec le lien de désinscription). Tables et styles en ligne : les messageries ignorent le reste. Un `MailParagraph` pose un paragraphe.
- `src/emails/tokens.ts` : les couleurs et polices du kit (`docs/direction-artistique.md`), écrites en dur.
- `src/emails/annonce-maquilleuses.tsx` : le courriel : objet, aperçu, titre, paragraphes, bouton, signature.
- `public/assets/email/*.png` : le logo et cinq dessins en PNG (les messageries n'aiment pas le WebP ni le SVG). Servis par le site : **les images n'apparaissent qu'après la mise en ligne de cette PR**.
- `bun run emails:render [dossier]` : écrit le HTML et le texte (`.emails-preview/` par défaut, ignoré par git). `EMAIL_ASSETS_BASE` pointe les images ailleurs.

## Polices

Aucune police web : les messageries n'en chargent pas de façon fiable, et le site n'héberge que des sous-ensembles de Bodoni. Les titres prennent Bodoni 72 ou Didot (présents sur tous les appareils Apple), sinon Georgia ou un serif ; le corps est en police système. Le dessin tient dans tous les cas.

## L'envoi

Le gabarit ne sait rien envoyer. La liste, les verrous, le journal d'envoi et la désinscription existent déjà : [`membres-courriel.md`](membres-courriel.md) (`bun run members:mail`). Brancher ce gabarit sur cette commande (le rendre en HTML et en texte à la place de `membersAnnouncementContent`) est l'étape suivante, quand le texte est final. La liste des adresses se lit sur le poste d'Andy, jamais par l'équipe ni par un agent.
