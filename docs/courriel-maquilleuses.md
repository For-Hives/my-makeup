# Le gabarit des courriels aux maquilleuses (React Email)

Un gabarit visuel pour écrire à toutes les maquilleuses. **Le dépôt est public : il ne contient que la version vide** (le design et un texte factice). Le vrai texte, avec les coordonnées personnelles du mainteneur, et le script d'envoi vivent dans `src/emails/local/`, dossier ignoré par git, sur le poste d'Andy. Rien n'est envoyé par le gabarit.

## Où

- `src/emails/components/MakeupMail.tsx` : l'enveloppe (logo et nom, bandeau indigo, eyebrow, titre en Bodoni avec **un seul mot en italique baie**, filet, corps, bouton en pilule encre, signature, cadre rose avec cinq dessins au trait, pied de page avec le lien de désinscription). Tables et styles en ligne : les messageries ignorent le reste. Un `MailParagraph` pose un paragraphe.
- `src/emails/tokens.ts` : les couleurs et polices du kit (`docs/direction-artistique.md`), écrites en dur.
- `src/emails/announcement.tsx` : la version vide du courriel (texte factice).
- `src/emails/local/` (ignoré) : `annonce.tsx` (le vrai texte) et `envoyer.tsx` (l'envoi unique : tout le monde en copie cachée, trois adresses de l'équipe en copie visible, lots de 44, journal des lots envoyés, liste à blanc par défaut, `--test <adresse>`, `--send --journal <fichier>`). La clé Resend n'est jamais lue : l'appel passe par `resend-api`.
- `public/assets/email/*.png` : le logo et cinq dessins en PNG (les messageries n'aiment pas le WebP ni le SVG). Servis par le site : **les images n'apparaissent qu'après la mise en ligne de cette PR**.
- `bun run emails:render [dossier]` : écrit le HTML et le texte (`.emails-preview/` par défaut, ignoré par git). `EMAIL_ASSETS_BASE` pointe les images ailleurs.

## Polices

Aucune police web : les messageries n'en chargent pas de façon fiable, et le site n'héberge que des sous-ensembles de Bodoni. Les titres prennent Bodoni 72 ou Didot (présents sur tous les appareils Apple), sinon Georgia ou un serif ; le corps est en police système. Le dessin tient dans tous les cas.

## L'envoi

Le gabarit ne sait rien envoyer. La liste, les verrous, le journal d'envoi et la désinscription existent déjà : [`membres-courriel.md`](membres-courriel.md) (`bun run members:mail`). Brancher ce gabarit sur cette commande (le rendre en HTML et en texte à la place de `membersAnnouncementContent`) est l'étape suivante, quand le texte est final. La liste des adresses se lit sur le poste d'Andy, jamais par l'équipe ni par un agent.
