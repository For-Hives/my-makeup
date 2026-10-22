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

**Pourquoi ces défauts.** Le ticket proposait 40 photos, 60 Mo et 12 Mo par envoi. Le volume et le poids par envoi sont repris. Le nombre est 45 : un portfolio complet de 40 photos, plus la photo principale, plus une marge de quatre photos pour qu'un remplacement (la nouvelle photo existe avant que l'ancienne soit retirée) ne se heurte pas à la limite au dernier emplacement. Le portfolio lui-même reste à 10 photos (`GALLERY_MAX`) : ce plafond vient de l'ancien site, il touche la fiche publique, l'import et d'autres tickets, et n'est pas changé ici. À 60 Mo pour 45 photos, chaque photo peut peser 1,3 Mo en moyenne, soit plus que les 1 Mo du navigateur.

## Ce qui est compté

- Les médias dont le propriétaire est la maquilleuse (`owner`), qu'ils soient dans son profil ou non : une photo envoyée directement à l'API pèse autant qu'une photo du portfolio. Un média de l'import dont le fichier n'existait plus (`objectMissing`) n'est pas compté.
- Le volume est la taille du fichier rangé (`filesize`). Les tailles dérivées existent dans le stockage mais ne sont pas additionnées : la limite protège le site d'un usage comme stockage, elle n'est pas une facture au Mo près.
- **L'admin et la rédaction ne sont pas soumises** aux limites du profil. Le poids par envoi vaut pour tout le monde.
- Le contrôle a lieu côté serveur, après la conversion et avant l'écriture dans le stockage : une photo refusée ne laisse aucun objet. Le refus est un `409` avec la phrase à montrer ; un `413` pour un envoi trop lourd ; un `400` pour un fichier qui n'est pas une image.
- Un profil qui dépasse déjà une limite (réglage abaissé, ou photos importées) **garde ses photos** et n'en ajoute plus tant qu'il n'est pas repassé sous la limite. Remplacer le fichier d'une photo existante ne compte pas une photo de plus.

## Ce que dit l'espace

La carte « Portfolio » écrit « Tes photos prennent 12,3 Mo sur 60 Mo. Il te reste 31 photos. » À la limite : « Tu as atteint la limite : retire une photo, puis enregistre, avant d'en ajouter une autre. » Le panneau refuse une photo en trop avant de la préparer. Le serveur décide : le panneau ne fait que le dire plus tôt.

## Connu et laissé

- Deux envois simultanés d'une même maquilleuse peuvent passer ensemble la limite du nombre (le contrôle lit puis écrit, sans verrou). Le dépassement est borné par le nombre d'envois parallèles, et l'espace envoie ses photos l'une après l'autre.
- Le rapprochement des médias et la sauvegarde (`bench:reconcile`, `media:backup`) ne changent pas : ils lisent les objets tels qu'ils sont.
