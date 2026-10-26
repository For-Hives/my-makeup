import Link from 'next/link'

const LINK = 'text-mute text-sm underline hover:text-indigo-700'

export function Signature() {
	return (
		<div className="mx-auto w-full max-w-7xl px-4 pb-10 md:px-8 2xl:px-0">
			<p className="border-hairline border-t pt-8 text-center text-mute text-sm">
				© {new Date().getFullYear()} My-Makeup - Tous droits réservés - Developed with ❤️ by{' '}
				<Link className={LINK} href="https://andy-cinquin.fr" target="_blank" rel="noopener noreferrer">
					Andy Cinquin
				</Link>
				&nbsp;&amp;&nbsp;
				<Link className={LINK} href="https://brev.al" target="_blank" rel="noopener noreferrer">
					Bréval Le Floch
				</Link>
				&nbsp;- 🐝
				<Link className={LINK} href="https://forhives.fr/" target="_blank" rel="noopener noreferrer">
					ForHives co-founders
				</Link>
			</p>
		</div>
	)
}
