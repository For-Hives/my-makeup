import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
	title: 'Espace maquilleuse',
}

// Placeholder of the makeup artist's space: sign-in, sign-up and the profile editor come later.
export default function AuthPage() {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-4xl">Espace maquilleuse</h1>
			<p>
				<Link className="underline" href="/">
					Retour à l’accueil
				</Link>
			</p>
		</main>
	)
}
