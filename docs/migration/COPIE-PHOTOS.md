# La copie quotidienne des photos et la corbeille du stockage (ticket 278)

Deux choses tiennent les photos après la bascule : une **copie** de `my-makeup` dans `my-makeup-media-backup`, refaite chaque jour, et une **règle du stockage** qui vide la corbeille (`deleted/`) au bout de 30 jours. L'outil est `bun run media:backup` (`scripts/media/backup.ts` et `scripts/media/backup/`). Il passe par l'API REST de Cloudflare avec le seul jeton `CLOUDFLARE_API_TOKEN` : on le lance sous `with-secret cloudflare -- …`.

Il ne supprime **rien**. Le client n'a aucun appel qui supprime (un test lit le code pour le garantir), il n'écrit jamais dans `my-makeup` (sauf les règles de cycle de vie, par `--lifecycle --apply`), et il n'écrit que dans la copie ou dans un compartiment jetable. Rien n'est écrit sans `--apply`. Aucune clé d'objet ne sort : des nombres, des dates et des empreintes.

## 1. La règle de la corbeille

```sh
with-secret cloudflare -- bun run media:backup -- --lifecycle            # montre, ne pose rien
with-secret cloudflare -- bun run media:backup -- --lifecycle --apply    # pose, relit
```

- La règle s'appelle `Erase the bin after 30 days` : préfixe `deleted/`, suppression après 30 jours (`PHOTO_ERASURE_DAYS`, 2 592 000 s). Aucun objet hors de `deleted/` n'est dans son périmètre.
- L'API pose la liste **entière** des règles d'un coup. L'outil relit les règles du compartiment, y ajoute la sienne et renvoie le tout : la règle `Default Multipart Abort` reste telle quelle. Après la pose, il relit la liste et vérifie que la règle est celle voulue et que **toutes les autres sont identiques** (code de sortie 1 sinon).
- Si une autre règle active supprime des objets hors de `deleted/`, l'outil ne pose rien et la nomme.
- Poser la règle demande l'accord d'Andy. À recopier ici après la pose (relecture par `GET`) : *à faire, la règle n'est pas encore posée sur le compartiment réel.*

## 2. La copie quotidienne

```sh
with-secret cloudflare -- bun run media:backup               # le plan, sans écrire
with-secret cloudflare -- bun run media:backup -- --apply    # la passe
```

1. Liste `my-makeup` (hors `deleted/`) et la copie.
2. Copie chaque objet nouveau ou changé : lu avec son MD5 contrôlé contre l'ETag, écrit dans la copie, l'ETag de l'écriture comparé au MD5 des octets lus.
3. Relit la copie et compare chaque objet de la source (taille, et ETag quand celui de la source est un MD5) : **écarts attendus : 0**. Code de sortie 1 en cas d'écart ou d'erreur.
4. Écrit le manifeste daté dans la copie : `_backup-manifests/<date>.json`. Nombres et empreintes SHA-256 seulement.

Un objet changé dans la source remplace son ancien exemplaire dans la copie (les photos portent un nom qui change quand elles changent : c'est rare). Un objet qui a quitté la source reste dans la copie (compté `retiredFromSource`).

### Planification

Sur la machine d'Andy, qui a le jeton dans son trousseau : une minuterie utilisateur systemd, **chaque jour à 04:30, heure de Paris** (hors des heures d'envoi des maquilleuses ; le passage prend quelques minutes une fois la première copie faite).

```ini
# ~/.config/systemd/user/media-backup.service
[Service]
Type=oneshot
WorkingDirectory=%h/clonedrepo/my-makeup/my-makeup
ExecStart=/usr/bin/with-secret cloudflare -- /usr/bin/bun run media:backup -- --apply

# ~/.config/systemd/user/media-backup.timer
[Timer]
OnCalendar=*-*-* 04:30:00 Europe/Paris
Persistent=true
[Install]
WantedBy=timers.target
```

`systemctl --user enable --now media-backup.timer`. `Persistent=true` rattrape un passage manqué quand la machine était éteinte. Le jeton Cloudflare n'est pas mis dans GitHub : une exécution programmée de la CI aurait besoin de ce secret.

### Le rapport du lundi

`with-secret cloudflare -- bun run media:backup -- --age` écrit `{"lastPassAt":…,"ageHours":…,"stale":…}` et sort avec le code 1 au-delà de **48 heures** ou sans aucun manifeste. Le rapport du lundi (dans le dépôt des plans) lit cette sortie : `stale` vrai est une alerte.

## 3. La restauration d'essai

```sh
with-secret cloudflare -- bun run media:backup -- --restore-check <clé> --into <compartiment-jetable>
```

Lit l'objet dans la copie, l'écrit dans le compartiment jetable, le relit, compare taille et MD5. Refuse la source et la copie comme destination. Le compartiment jetable se crée et se supprime avec l'accord d'Andy ; l'outil ne sait ni l'un ni l'autre de lui-même.

## 4. Ce qu'il faut savoir

- **La copie garde les photos retirées.** La corbeille de `my-makeup` se vide à 30 jours, mais la copie, qui ne supprime jamais, garde l'exemplaire de `media/`. La politique de confidentialité (« effacée définitivement de notre stockage au bout de 30 jours ») n'est donc exacte que pour `my-makeup`. Décision prise au ticket 278 (la plus prudente, qui ne suppose aucune suppression) : la politique de confidentialité le dit, en une phrase dans le paragraphe de la durée (la copie quotidienne, qui ne supprime rien, garde une photo retirée jusqu'à une demande d'effacement). Andy peut encore préférer une purge de la copie, sur accord et par une liste, des objets absents de la source depuis plus de 30 jours (le manifeste donne leur nombre, `retiredFromSource`) : la phrase de la politique serait alors à réécrire.
- Le format de la requête de la règle suit la référence de l'API Cloudflare (`PUT /accounts/{id}/r2/buckets/{bucket}/lifecycle`, `rules[].conditions.prefix`, `deleteObjectsTransition.condition`). Il n'a pas été joué contre le compartiment réel : la première pose, sur accord, se fait d'abord sans `--apply`.
