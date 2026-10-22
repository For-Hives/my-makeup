# Les liens du courrier qui ouvrent une session

Deux liens envoyés par email peuvent ouvrir la session de la maquilleuse (ticket 302) : celui de la confirmation de l'adresse, et celui du mot de passe oublié. Ce document dit la durée de chacun, leur usage unique et ce qui les refuse. Le code est dans `src/lib/auth/` (`confirmation.ts`, `confirmation-link.ts`, `session-after-link.ts`, `password-reset-payload.ts`).

## Le lien de confirmation

- **Le lien seul n'ouvre rien.** `/auth/verification-complete?code=…` confirme l'adresse, comme avant. Un lecteur de courrier qui suit les liens avant la personne aurait sinon une session. Le proxy range le code dans un cookie `mm-confirm` (HttpOnly, propre à la page, une heure) et renvoie vers l'adresse nue : le code ne reste ni dans l'adresse, ni dans l'historique, ni dans un Referer, ni dans la mesure d'audience.
- **Un clic ouvre la session.** Le bouton « Continuer vers mon profil » appelle une action serveur qui prend le lien et ouvre la session, puis mène à « Prépare ton profil ». Le code vient du cookie, jamais du formulaire. Un lien ouvert sur un autre appareil que celui de l'inscription marche : tout est dans le lien et le cookie.
- **Usage unique.** Dans `pros._verificationToken` : jeton brut (non confirmé), puis `pending:<empreinte>` (adresse confirmée, session non prise), puis `utilise:<empreinte>` (session prise ou refusée). Chaque passage est une écriture atomique qui porte l'état précédent dans sa condition : deux clics au même instant donnent une session au plus. Le jeton n'est jamais gardé en clair après son usage.
- **Durée : une heure depuis la création du compte.** Le jeton de Payload n'a pas de date propre et un renvoi reprend le même : la fenêtre se compte donc depuis `createdAt`. Passée l'heure, le lien confirme encore l'adresse mais n'offre plus de session (l'écran d'avant). La fenêtre est vérifiée à l'affichage et de nouveau au clic. Constante : `SESSION_OFFER_WINDOW_MS`.
- **Refus sans explication.** Un compte bloqué, ou une adresse non confirmée, n'obtient pas de session ; la personne est renvoyée à « Se connecter », qui dit déjà ce qu'il faut au bon mot de passe. Un compte supprimé n'a plus de jeton : « lien invalide ». Le contrôle se fait dans la transaction qui écrit la session (`openWithoutPassword`, paramètre `refuse`).
- **Freins.** 30 ouvertures par heure et par adresse cliente (`confirmationRateLimit`), les mêmes pour la page et le clic.

## Le nouveau mot de passe

Le lien de mot de passe oublié vit une heure et ne sert qu'une fois (tickets 085 et 086). Une fois le mot de passe enregistré (toutes les sessions du compte sont alors vidées), le serveur ouvre une seule session, après la validation de la transaction, et mène à l'espace (ou à l'accueil tant que le profil n'est pas actif, ticket 296). Un compte bloqué est refusé par Payload dès le choix du mot de passe ; une adresse jamais confirmée n'obtient pas de session. Si l'ouverture échoue, l'écran « Ton mot de passe est modifié » d'avant reste.

## Durée de la session ouverte

La même que celle d'une connexion par mot de passe (14 jours glissants, 90 jours au plus, `session-duration.ts`). Les deux chemins sont une preuve équivalente à la connexion : la boîte mail.

## Le journal

Chaque ouverture écrit une ligne `sign-in` dont la méthode est `confirmation` ou `password-reset`, et le code `ok`, `compte-bloque`, `email-non-confirme` ou `service-indisponible`. Le journal n'a aucun champ pour un jeton, une adresse ou un mot de passe.

## Ce qui reste connu

- Un lien envoyé à quelqu'un d'autre (la personne qui le reçoit clique) connecte celle qui clique au compte du lien : c'est la propriété de tout lien de connexion par courrier, bornée ici par l'heure, l'usage unique et le clic.
- Le marqueur de mesure `login_result` n'est pas posé par ces deux chemins.
