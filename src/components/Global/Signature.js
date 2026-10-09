import Link from 'next/link'

export function Signature({ isPaddingActivated = true }) {
	const actualYear = new Date().getFullYear()
	return (
		<div className={`mx-auto flex w-full max-w-7xl py-20 ${isPaddingActivated ? 'px-4 md:px-8 2xl:px-0' : ''}`}>
			<p className={'mx-auto text-sm text-gray-600'}>
				© {actualYear} My-Makeup - Tous droits réservés - Developed with ❤️ by{' '}
				<Link className={'text-sm text-gray-600 underline'} href={'https://andy-cinquin.fr'} target={'_blank'}>
					Andy Cinquin
				</Link>
				&nbsp;&&nbsp;
				<Link className={'text-sm text-gray-600 underline'} href={'https://brev.al'} target={'_blank'}>
					Bréval Le Floch
				</Link>
				&nbsp; - 🐝
				<Link className={'text-sm text-gray-600 underline'} href={'https://forhives.fr/'} target={'_blank'}>
					ForHives co-founders
				</Link>
			</p>
		</div>
	)
}
