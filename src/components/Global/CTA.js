import Image from 'next/image'
import Link from 'next/link'

function Cta() {
	return (
		<div className={'relative w-full'}>
			<div
				className={
					'absolute left-0 top-0 -z-10 h-full w-[100%] overflow-visible'
				}
			>
				<Image
					className={'-z-10 overflow-visible object-cover'}
					alt={'blob'}
					fill
					src={'/assets/blob.svg'}
				/>
			</div>
			<div className="relative mx-auto max-w-7xl py-64">
				<div className="z-20 mx-auto flex w-1/2 flex-col gap-16">
					<h2 className="text-center text-4xl font-bold tracking-tight text-white sm:text-4xl sm:leading-snug">
						Rejoignez&nbsp;My-Makeup,
						la&nbsp;communauté&nbsp;qui&nbsp;fait&nbsp;la&nbsp;différence.
					</h2>
					<div className={'flex justify-center gap-8'}>
						<Link href="/search" className={'btn-secondary-white'}>
							Je cherche des maquilleuses
						</Link>
						<Link
							href="/auth/signup"
							className={'btn-secondary-white-bordered'}
						>
							Je cherche des missions
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}

export default Cta
