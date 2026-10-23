# Les photos : conversion en WebP et limites de stockage

Ticket 309, décision d'Andy du 22/10/2026. Ce que le serveur fait d'une photo envoyée, ce qu'il limite, et comment on règle chaque valeur sans toucher au code.

## Ce que le serveur fait de chaque photo

Toute photo envoyée à `POST /api/media` (par l'espace, ou directement par l'API) est refusée si ce n'est pas un JPEG, un PNG ou un WebP lu dans son contenu. Sinon le serveur :

1. la remet à l'endroit d'après son orientation EXIF ;
2. la réduit pour que son grand côté ne dépasse pas la valeur réglée (jamais d'agrandissement) ;
3. l'encode en WebP à la qualité réglée ;
4. la range sous un nom tiré au hasard (`<uuid>.webp`).

Les métadonnées (EXIF, position GPS d'un téléphone) ne sont pas recopiées. **L'original n'est pas gardé.** Les tailles dérivées (vignette, petite, moyenne, grande) sont faites depuis la photo convertie et sont aussi des WebP.

Une photo déjà reprise de l'ancien site n'est ni supprimée ni convertie de force : seule une photo envoyée après ce ticket passe par la conversion. Le navigateur réduit toujours la photo avant l'envoi (2 000 px, WebP, 1 Mo au plus) : la conversion du serveur est la garantie, pas la première réduction.

## Les réglages

Des variables d'environnement, toutes facultatives. Vide : la valeur par défaut. Une valeur qui n'est pas un entier dans les bornes arrête le démarrage, et le message nomme la variable sans montrer la valeur.

| Variable | Défaut | Bornes | Rôle |
|---|---|---|---|
| `PHOTO_UPLOAD_MAX_MB` | 12 | 1 à 50 | Poids d'un envoi avant conversion, en Mo (1 Mo = 1 048 576 octets). Au-delà : 413, « La photo est trop lourde ». |
| `PHOTO_PROFILE_MAX_COUNT` | 45 | 1 à 500 | Nombre de photos qu'une maquilleuse garde sur le site. |
| `PHOTO_PROFILE_MAX_MB` | 60 | 1 à 2000 | Volume cumulé de ses photos rangées, en Mo, après conversion. |
| `PHOTO_WEBP_QUALITY` | 82 | 40 à 95 | Qualité du WebP. |
| `PHOTO_SIDE_MAX_PX` | 2000 | 800 à 4000 | Grand côté d'une photo rangée, en pixels. |

Un réglage change après un redémarrage du serveur, sans nouveau build.

**Pourquoi ces défauts.** Le ticket proposait 40 photos, 60 Mo et 12 Mo par envoi. Le volume et le poids par envoi sont repris. Le nombre est 45 : un stock par compte, qui laisse de la place aux photos envoyées avant d'être retirées ou remplacées (la nouvelle photo existe avant que l'ancienne soit retirée). Le portfolio lui-même reste à 10 photos (`GALLERY_MAX`) : voir « Le plafond de la galerie » plus bas. À 60 Mo pour 45 photos, chaque photo peut peser 1,3 Mo en moyenne, soit plus que les 1 Mo du navigateur.

## Ce qui est compté

- Les médias dont le propriétaire est la maquilleuse (`owner`), qu'ils soient dans son profil ou non : une photo envoyée directement à l'API pèse autant qu'une photo du portfolio. Un média de l'import dont le fichier n'existait plus (`objectMissing`) n'est pas compté.
- Le volume est la taille du fichier rangé (`filesize`). Les tailles dérivées existent dans le stockage mais ne sont pas additionnées : la limite protège le site d'un usage comme stockage, elle n'est pas une facture au Mo près.
- **L'admin et la rédaction ne sont pas soumises** aux limites du profil. Le poids par envoi vaut pour tout le monde.
- Le contrôle a lieu côté serveur, après la conversion et avant l'écriture dans le stockage : une photo refusée ne laisse aucun objet. Le refus est un `409` avec la phrase à montrer ; un `413` pour un envoi trop lourd ; un `400` pour un fichier qui n'est pas une image.
- Un profil qui dépasse déjà une limite (réglage abaissé, ou photos importées) **garde ses photos** et n'en ajoute plus tant qu'il n'est pas repassé sous la limite. Remplacer le fichier d'une photo existante ne compte pas une photo de plus.

## Ce que dit l'espace

La carte « Portfolio » écrit « Tes photos prennent 12,3 Mo sur 60 Mo. Il te reste 31 photos. » À la limite : « Tu as atteint la limite : retire une photo, puis enregistre, avant d'en ajouter une autre. » Le panneau refuse une photo en trop avant de la préparer. Le serveur décide : le panneau ne fait que le dire plus tôt.

## Le plafond de la galerie : décision du 23/10/2026 (issue 996)

**Le portfolio reste à 10 photos (`GALLERY_MAX`).** Les limites de volume (`PHOTO_PROFILE_MAX_MB`) et de nombre (`PHOTO_PROFILE_MAX_COUNT`) protègent le stockage ; le plafond de 10 est un choix d'affichage et de parité, et il ne se règle pas par le volume :

- l'ancien site avait le même plafond, l'import range et compte une galerie de plus de 10 photos comme un écart (`docs/migration/SCHEMA.md`, règle 5) ;
- la fiche publique est un défilement horizontal : au-delà de 10 photos, chaque photo en plus alourdit la page (poids, images chargées) pour un gain que rien n'a mesuré ;
- le plafond vit dans `src/lib/media.ts` et touche la collection, l'espace, les messages et les données de démonstration ; un relèvement est un seul changement de constante plus un test, quand Andy le décide.

La limite de 45 photos n'est donc pas un portfolio de 45 photos : c'est un stock par compte (portfolio de 10, photo principale, photos envoyées puis retirées ou remplacées avant l'enregistrement, marge). Une phrase de la version du 22/10 parlait d'un « portfolio complet de 40 photos » : elle était fausse, corrigée ici.

## Deux envois simultanés (issue 996)

Le contrôle des limites lisait l'usage de la maquilleuse puis écrivait sa photo, sans verrou : deux envois partis ensemble lisaient le même usage et passaient tous deux (reproduit sur le banc : avec une limite de 1 photo, 6 envois simultanés donnaient 6 photos ; avec une place de volume, 3 envois donnaient 3 photos). Le contrôle prend maintenant un verrou de PostgreSQL (`pg_advisory_xact_lock`, `lockPhotoUsage` dans `src/lib/photo-usage.ts`), tenu jusqu'à la fin de la transaction de l'envoi et propre au compte : les envois d'une même maquilleuse font la queue, ceux de deux comptes ne s'attendent pas. Le second lit l'usage une fois le premier validé et reçoit son 409. La conversion en WebP se fait avant le verrou, donc le verrou ne couvre que la lecture, l'écriture de la ligne et l'envoi de l'objet.

## Le refus de quota

Le serveur répond `409` avec la phrase à montrer (`quotaVerdict`) ; l'espace la lit dans la réponse (`uploadPhoto`) et l'affiche telle quelle, avec une phrase de repli si la réponse n'en porte pas. Les deux phrases disent quoi faire : « Tu as atteint la limite de 45 photos : retire une photo, puis enregistre, avant d’en ajouter une autre. » et « Cette photo ne rentre pas dans ton espace (12,3 Mo utilisés sur 60 Mo) : retire une photo, puis enregistre, avant de réessayer. ». Un essai d'intégration lit ces phrases dans la réponse du serveur ; un essai unitaire lit celle que l'espace affiche.

## Connu et laissé

- Le rapprochement des médias et la sauvegarde (`bench:reconcile`, `media:backup`) ne changent pas : ils lisent les objets tels qu'ils sont.
