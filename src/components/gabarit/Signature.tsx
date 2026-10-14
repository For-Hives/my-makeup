import Link from 'next/link'

const LIEN = 'text-gray-600 text-sm underline'

export function Signature() {
	return (
		<div className="mx-auto flex w-full max-w-7xl px-4 py-20 md:px-8 2xl:px-0">
			<p className="mx-auto text-center text-gray-600 text-sm">
				© {new Date().getFullYear()} My-Makeup - Tous droits réservés - Developed with ❤️ by{' '}
				<Link className={LIEN} href="https://andy-cinquin.fr" target="_blank" rel="noopener noreferrer">
					Andy Cinquin
				</Link>
				&nbsp;&amp;&nbsp;
				<Link className={LIEN} href="https://brev.al" target="_blank" rel="noopener noreferrer">
					Bréval Le Floch
				</Link>
				&nbsp;- 🐝
				<Link className={LIEN} href="https://forhives.fr/" target="_blank" rel="noopener noreferrer">
					ForHives co-founders
				</Link>
			</p>
		</div>
	)
}
