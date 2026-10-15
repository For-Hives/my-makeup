# IndexNow : prévenir les moteurs quand une page publique change

Le ticket 219 prévient Bing et les autres moteurs du protocole IndexNow (Yandex, Seznam, Naver, Yep ; pas Google) quand une page publique change. L'envoi part du même endroit que le rafraîchissement des pages (`src/collections/revalidation.ts`).

## Ce qui est envoyé, et quand

- Un profil qui devient publiable, qui cesse de l'être, ou qui change alors qu'il l'est : l'adresse de sa page `/profil/<slug>` (l'ancienne et la nouvelle si l'adresse change).
- Un article ou un talent publié, modifié, dépublié ou supprimé : l'adresse de sa page `/blog/<slug>` ou `/talent/<slug>`.
- Jamais une page de liste (recherche, blog, accueil, sitemap), jamais un brouillon qui reste brouillon, jamais un profil hors sitemap.
- L'envoi part cinq secondes après l'enregistrement, pour que la page soit déjà à jour quand un moteur la relit ; les adresses de plusieurs enregistrements proches partent dans une seule requête vers `https://api.indexnow.org/indexnow`.
- Un envoi en échec n'empêche jamais l'enregistrement : il laisse une ligne dans le journal (`[indexnow] … not sent`), sans la clé ni les adresses.

## Quand rien ne part

- Sans la variable `INDEXNOW_KEY` : rien n'est servi, rien n'est envoyé.
- Hors du site : l'envoi ne part que si `NEXT_PUBLIC_SITE_URL` vaut `https://my-makeup.fr`. La préprod, un poste et le banc de test n'envoient rien, même avec une clé.
- Pendant l'import : il ne rafraîchit rien et ne prévient personne.
- Une adresse qui n'est pas en https sur l'hôte principal est écartée avant la requête.

## La clé

- La variable `INDEXNOW_KEY` : 32 caractères hexadécimaux en minuscules (`openssl rand -hex 16`). Elle est réglée dans Coolify, jamais dans un fichier du dépôt. Une valeur illisible arrête le démarrage.
- Le site la sert à la racine, à `/<clé>.txt`, avec la clé pour seul contenu (200). Toute autre clé, et toute clé quand la variable manque, répond 404.
- Le jour de la bascule, la clé à régler est celle que l'ancien site sert déjà : c'est le nom de son fichier à la racine. Les moteurs la connaissent, et l'adresse gelée `verification-indexnow` (`docs/migration/URLS.md`) reste la même.

## Le jour J (ticket 193) : une ligne du pas-à-pas

Après l'échange des domaines, envoyer toutes les adresses du sitemap :

```sh
INDEXNOW_KEY=<la clé> bun run indexnow:tout
```

La commande lit le sitemap du site en ligne et envoie ce qu'il liste (une requête par 10 000 adresses). La réponse attendue est 200 ou 202. Le ticket 184 reprend cette ligne dans le pas-à-pas.

## Recette

Dans Bing Webmaster Tools, la page IndexNow affiche les adresses reçues. C'est la seule recette qui voit les moteurs : elle se fait sur le site, après la bascule.
