import Image from 'next/image'
import Link from 'next/link'

/** The content of the 404 page, in the template (ticket 069). The words are those of the site online. */
export function NotFoundPage() {
	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 items-center gap-10 px-4 py-16 sm:px-6 lg:px-20">
			<div className="mx-auto w-full max-w-sm lg:mx-0 lg:w-96">
				<h1 className="my-8 font-semibold text-2xl text-slate-900">404 - Page non trouvée</h1>
				<p className="text-gray-700">Oops ! La page que vous cherchez n'existe pas.</p>
				<Link href="/" className="btn-primary-large mt-8">
					Retourner à l'accueil
				</Link>
			</div>
			<div className="relative hidden h-96 flex-1 lg:block">
				<Image alt="" fill sizes="50vw" src="/assets/404Cat.webp" className="object-contain" />
			</div>
		</main>
	)
}
