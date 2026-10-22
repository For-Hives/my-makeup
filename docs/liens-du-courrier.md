# Les liens du courrier qui ouvrent une session

Deux liens envoyés par email peuvent ouvrir la session de la maquilleuse (tickets 302 et 311) : celui de la confirmation de l'adresse, et celui du mot de passe oublié. Ce document dit la durée de chacun, leur usage unique et ce qui les refuse. Le code est dans `src/lib/auth/` (`confirmation.ts`, `confirmation-link.ts`, `session-after-link.ts`, `password-reset-payload.ts`, `mail-link-window.ts`).

## Le lien de confirmation

- **Le lien seul n'ouvre rien.** `/auth/verification-complete?code=…` confirme l'adresse, comme avant. Un lecteur de courrier qui suit les liens avant la personne aurait sinon une session. Le proxy range le code dans un cookie `mm-confirm` (HttpOnly, propre à la page, 24 heures) et renvoie vers l'adresse nue : le code ne reste ni dans l'adresse, ni dans l'historique, ni dans un Referer, ni dans la mesure d'audience.
- **Un clic ouvre la session.** Le bouton « Continuer vers mon profil » appelle une action serveur qui prend le lien et ouvre la session, puis mène à « Prépare ton profil ». Le code vient du cookie, jamais du formulaire. Un lien ouvert sur un autre appareil que celui de l'inscription marche : tout est dans le lien et le cookie.
- **Usage unique.** Dans `pros._verificationToken` : jeton brut (non confirmé), puis `pending:<empreinte>` (adresse confirmée, session non prise), puis `utilise:<empreinte>` (session prise ou refusée). Chaque passage est une écriture atomique qui porte l'état précédent dans sa condition : deux clics au même instant donnent une session au plus. Le jeton n'est jamais gardé en clair après son usage.
- **Durée : 24 heures depuis la création du compte** (ticket 311, décision d'Andy du 22/10/2026 ; une heure au ticket 302). Le réglage est `MAIL_LINK_WINDOW_MS` (`mail-link-window.ts`), partagé avec le mot de passe oublié ; `SESSION_OFFER_WINDOW_MS` dans `confirmation-link.ts` le reprend ; le cookie `mm-confirm` en reprend la durée. Le jeton de Payload n'a pas de date propre et un renvoi reprend le même : la fenêtre se compte donc depuis `createdAt`, et non depuis l'envoi du dernier courrier. Passées les 24 heures, le lien confirme encore l'adresse mais n'offre plus de session : la maquilleuse se connecte avec le mot de passe qu'elle a choisi à l'inscription (une adresse et un mot de passe, une fois). Cette borne est gardée exprès : elle limite ce que vaut un courrier ancien resté dans une boîte. La fenêtre est vérifiée à l'affichage et de nouveau au clic. Un test la garde, à 23 h 59 et à 24 h 01 (`tests/unit/confirmation-link.test.ts`, `tests/integration/auth-session-after-link.test.ts`).
- **Refus sans explication.** Un compte bloqué, ou une adresse non confirmée, n'obtient pas de session ; la personne est renvoyée à « Se connecter », qui dit déjà ce qu'il faut au bon mot de passe. Un compte supprimé n'a plus de jeton : « lien invalide ». Le contrôle se fait dans la transaction qui écrit la session (`openWithoutPassword`, paramètre `refuse`).
- **Freins.** 30 ouvertures par heure et par adresse cliente (`confirmationRateLimit`), les mêmes pour la page et le clic.

## Le nouveau mot de passe

Le lien de mot de passe oublié vit **24 heures** et ne sert qu'une fois (tickets 085 et 086 ; une heure à l'origine, passé à 24 heures par la décision d'Andy du 22/10/2026, comme le lien de confirmation). Le réglage est unique : `MAIL_LINK_WINDOW_MS` dans `src/lib/auth/mail-link-window.ts`, lu par la durée du jeton de Payload (`forgotPassword.expiration`, `LINK_DURATION_MS`), le cookie `mm-reset`, le texte du courrier (« valable 24 heures ») et la fenêtre de la confirmation (`SESSION_OFFER_WINDOW_MS`). Un test garde la borne, à 23 h 59 et à 24 h 01 (`tests/integration/auth-forgot-password.test.ts`, `tests/unit/forgot-password.test.ts`). L'usage unique ne change pas : le jeton est réclamé dans la transaction qui écrit le mot de passe, et un second envoi est refusé. Une fois le mot de passe enregistré (toutes les sessions du compte sont alors vidées), le serveur ouvre une seule session, après la validation de la transaction, et mène à l'espace (ou à l'accueil tant que le profil n'est pas actif, ticket 296). Un compte bloqué est refusé par Payload dès le choix du mot de passe.

**Une adresse jamais confirmée est confirmée par ce lien (ticket 311).** Le lien est parti vers la boîte du compte : le suivre prouve l'adresse autant que le lien de confirmation. Dans la même transaction que le nouveau mot de passe, `_verified` passe à vrai, puis la session s'ouvre. Avant, un compte repris de l'ancien site et jamais confirmé, ou un compte dont le courrier de confirmation était perdu, choisissait un mot de passe et restait sans session ni connexion possible (la connexion refuse une adresse non confirmée) : il lui fallait encore le lien de confirmation. Le lien de confirmation suivi plus tard dit « déjà confirmée » et n'ouvre rien. Si l'ouverture de la session échoue, l'écran « Ton mot de passe est modifié » d'avant reste.

## Les parcours et leurs reconnexions

Chaque parcours a été joué de bout en bout (tests de bout en bout cités). « Saisies » compte les champs remplis par la maquilleuse, hors clic sur le courrier.

| Parcours | Écrans | Saisies | Reconnexion évitable ? |
|---|---|---|---|
| Inscription par mot de passe, puis lien du courrier | 4 : formulaire, mur « Vérifie ton adresse », confirmation, « Prépare ton profil » | 3 (nom, adresse, mot de passe) | Non : un clic ouvre la session, sur n'importe quel appareil, dans les 24 heures |
| Inscription Google | 2 : bouton Google, « Prépare ton profil » | 0 | Non : la session s'ouvre au retour de Google |
| Confirmation d'adresse (lien ouvert plus tard, autre appareil) | 2 : confirmation, « Prépare ton profil » | 0 | Non dans les 24 heures. Au-delà : une connexion (2 saisies), gardée (voir plus haut) |
| Mot de passe oublié | 3 : demande, choix du mot de passe, espace | 3 (adresse, mot de passe, confirmation) | Non : la session s'ouvre au choix du mot de passe |
| Compte venu de Facebook (ou de Google) qui choisit un mot de passe | 4 : connexion (aide), demande, choix, espace | 3 (adresse, mot de passe, confirmation) | Non. Cas corrigé : si l'adresse n'était pas confirmée, elle l'est désormais par le lien, au lieu d'une impasse |
| Retour par un lien du courrier de relance | 1 à 2 | 0 à 2 | Pas de courrier de relance dans la v3 : le seul courrier du site avec un lien vers l'espace est la confirmation. Une page privée demandée sans session mène à la connexion puis revient à la même page (`callbackUrl`) ; la session dure 14 jours glissants, donc la reconnexion est rare |

## Les reconnexions gardées, et pourquoi

- Après 24 heures, le lien de confirmation n'ouvre plus de session : borne de sécurité d'un courrier ancien.
- Après 14 jours sans venir (90 au plus), la session se ferme : voir « Durée de la session ouverte ».
- Un compte bloqué n'obtient jamais de session par un lien.

## Durée de la session ouverte

La même que celle d'une connexion par mot de passe (14 jours glissants, 90 jours au plus, `session-duration.ts`). Les deux chemins sont une preuve équivalente à la connexion : la boîte mail.

## Le journal

Chaque ouverture écrit une ligne `sign-in` dont la méthode est `confirmation` ou `password-reset`, et le code `ok`, `compte-bloque`, `email-non-confirme` ou `service-indisponible`. Le journal n'a aucun champ pour un jeton, une adresse ou un mot de passe.

## Ce qui reste connu

- Un lien envoyé à quelqu'un d'autre (la personne qui le reçoit clique) connecte celle qui clique au compte du lien : c'est la propriété de tout lien de connexion par courrier, bornée ici par les 24 heures, l'usage unique et le clic.
- Le marqueur de mesure `login_result` n'est pas posé par ces deux chemins.
- Une personne à qui un tiers fait suivre un lien frais (un compte créé par ce tiers) arrive sur « Continuer » avec le code du tiers dans son cookie : si elle clique, elle est connectée au compte du tiers. Même propriété que le mot de passe oublié ; bornée à 24 heures et à un clic. Relevé par le relecteur sécurité, accepté.
- Le jeton brut figure dans les journaux d'accès du serveur avant la redirection : inévitable pour un lien de courrier.
- Une ouverture par lien n'écrit pas `lastSignInAt` (le chemin Google l'écrit) : à décider avec la mesure.
