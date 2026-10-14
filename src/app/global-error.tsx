'use client'

// The last resort, when the shell itself fails: no stylesheet, no component of the site.
export default function ErreurGlobale() {
	return (
		<html lang="fr">
			<body style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem' }}>
				<meta name="robots" content="noindex, nofollow" />
				<h1>Un problème est survenu</h1>
				<p>Le site ne peut pas afficher cette page pour le moment. Réessayez dans quelques instants.</p>
				<p>
					<a href="/">Retourner à l'accueil</a>
				</p>
			</body>
		</html>
	)
}
