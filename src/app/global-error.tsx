'use client'

import { ErrorAnalytics } from '@/components/analytics/PageAnalytics'

// The last resort, when the shell itself fails: no stylesheet, no component of the site.
// The shell is gone, and so is the script of the head: the event is kept only if the tracker was
// already loaded (ticket 145).
export default function ErreurGlobale({ error }: { error: Error & { digest?: string } }) {
	return (
		<html lang="fr">
			<body style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem' }}>
				<meta name="robots" content="noindex, nofollow" />
				<ErrorAnalytics scope="global" erreur={error} />
				<h1>Un problème est survenu</h1>
				<p>Le site ne peut pas afficher cette page pour le moment. Réessayez dans quelques instants.</p>
				<p>
					<a href="/">Retourner à l'accueil</a>
				</p>
			</body>
		</html>
	)
}
