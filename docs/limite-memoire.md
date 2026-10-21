# Taille des envois et mémoire du conteneur (ticket 273)

## Ce que le code fait

- **Une seule constante** : `PHOTO_SIZE_MAX` (10 Mio, `src/lib/photo-upload.ts`). Le lecteur de corps multipart de Payload la reçoit par `upload.limits.fileSize` (`PAYLOAD_UPLOAD_LIMITS`, posé dans `src/payload.config.ts`). Il lit le corps en flux et s'arrête dès que la limite est franchie : un fichier trop gros répond 413 avec la phrase du site (« La photo dépasse 10 Mo : choisis-en une plus légère. »), sans que le reste soit lu. Le plafond de toute la requête est `UPLOAD_REQUEST_SIZE_MAX` (10 Mio plus 1 Mio d'enveloppe multipart) ; les défauts de Payload étaient 20 Mio par fichier et 50 Mio par requête.
- **Avant la lecture du corps** : Payload lit le corps avant de contrôler l'accès, et ne permet pas de faire autrement dans sa configuration. Le contrôle se fait donc dans `src/proxy.ts` (`src/lib/upload-guard.ts`) : un `POST`, `PATCH` ou `PUT` vers `/api/media` sans cookie de session répond 403, et un `Content-Length` supérieur à `UPLOAD_REQUEST_SIZE_MAX` répond 413. Le cookie est seulement cherché, jamais vérifié : Payload décide qui peut envoyer. Un corps sans longueur annoncée (chunked) est coupé par la limite de Payload.
- **Le client** (`uploadPhoto`) lit déjà le 413 comme un refus de taille.

## Limite de mémoire du conteneur (à faire par Andy)

Mesures de la v3 sur le banc (application construite pour la production, `next start`) : voir la section « Mesures » ci-dessous.

Geste dans Coolify : application My Makeup v3 > **Configuration** > **Resource Limits** > « Maximum Memory Limit » : saisir la valeur recommandée, enregistrer, puis redéployer (la limite ne s'applique qu'au nouveau conteneur). Laisser « Maximum Swap Limit » à sa valeur par défaut. Aujourd'hui `limits_memory` vaut `0` : aucune limite.

Après le redéploiement, regarder pendant une journée que le conteneur n'est pas tué pour manque de mémoire (état « OOMKilled » dans les journaux de Coolify) ; si c'est le cas, monter la valeur d'un cran.

## Mesures

Application construite pour la production et démarrée sur le banc (`bun run test:e2e`), mémoire résidente du processus et de ses enfants relevée toutes les 2 secondes (21/10/2026, poste chargé) :

| Moment | Mémoire résidente |
|---|---|
| Démarrage, premières pages | 125 à 340 Mio |
| Pendant les 570 essais de bout en bout (deux navigateurs en parallèle, optimisation d'images, crawl) | 1,0 à 1,3 Gio, **crête 1 367 Mio** |
| Application seule, pendant l'import réel de la fausse source | 170 à 300 Mio |

Ces chiffres viennent du banc, pas du site : le trafic réel est plus calme que les essais, mais le jeu de données du site est plus gros que celui du banc.

**Valeur proposée : 2 Gio** (la crête mesurée, 1,37 Gio, plus environ 50 % de marge). Une fois le site en ligne, relever la mémoire réelle dans Coolify pendant une semaine : si elle reste sous 600 Mio, ramener la limite à 1 Gio.
