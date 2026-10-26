import Image from 'next/image'
import Link from 'next/link'
import { pillClassName } from '@/components/art/pill-class'
import { body, display } from '@/components/direct-edit/fonts'

/** The content of the 404 page, in the template (ticket 069). The words are those of the site online. In the kit's look (coherence pass). */
export function NotFoundPage() {
	return (
		<main
			className={`relative flex w-full flex-1 items-center bg-art-paper text-ink ${display.variable} ${body.variable} font-body`}
		>
			<div className="page-frame flex items-center gap-10 py-16">
				<div className="mx-auto w-full max-w-md lg:mx-0">
					<h1 className="text-balance font-display font-medium text-4xl leading-[1.1] tracking-tight sm:text-5xl">
						404 - Page non trouvée
					</h1>
					<p className="mt-6 text-lg text-mute leading-8">Oops ! La page que vous cherchez n'existe pas.</p>
					<Link href="/" prefetch={false} className={`${pillClassName({ variant: 'filled' })} mt-10`}>
						Retourner à l'accueil
					</Link>
				</div>
				<div className="relative hidden h-96 flex-1 lg:block">
					<Image alt="" fill sizes="50vw" src="/assets/404Cat.webp" className="object-contain mix-blend-multiply" />
				</div>
			</div>
		</main>
	)
}
