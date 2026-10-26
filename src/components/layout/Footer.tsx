import Image from 'next/image'
import Link from 'next/link'
import { GlowBlob, MakeupObject } from '@/components/art/graphics'
import { FOOTER_COLUMNS, NETWORKS } from './links'
import { Signature } from './Signature'

/**
 * The foot of every public page, in the look of the art direction kit: paper (no rule or margin above it: the page background flows into it, 25/10/2026), the brand and
 * its networks (round pill links), the link columns with a Bodoni title, a one-line drawing and a diffuse glow behind
 * (decoration, hidden from screen readers). Server component: no script. The links and the texts are those of the
 * site as it is online.
 */
export function Footer() {
	return (
		<div className="bg-art-paper text-ink">
			<footer className="relative overflow-hidden">
				<GlowBlob size="md" tone="rose" className="-right-72 -bottom-72" />
				<div className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pt-12 pb-16 md:px-8 2xl:px-0">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute bottom-3 left-8 hidden h-24 w-24 text-art-line md:block 2xl:left-0"
					>
						<MakeupObject name="brush" />
					</span>
					<div className="flex flex-col gap-12 md:flex-row md:gap-10">
						<div className="flex flex-col gap-6">
							<div className="flex items-center justify-start gap-3">
								<Image src="/assets/logo.webp" alt="Logo My-Makeup" width={50} height={50} />
								<p className="font-display font-medium text-3xl text-ink">My-Makeup</p>
							</div>
							<p className="text-mute text-sm">
								Sciez,
								<br />
								Haute-Savoie
							</p>
							<ul className="flex flex-row flex-wrap gap-3 md:max-w-40 lg:max-w-none">
								{NETWORKS.map(reseau => (
									<li key={reseau.href}>
										<Link
											href={reseau.href}
											rel="noopener nofollow noreferrer"
											className="grid size-11 place-items-center rounded-full border border-ink hover:bg-art-blush hover:no-underline"
										>
											<Image src={reseau.icone} width={26} height={26} alt={reseau.nom} />
										</Link>
									</li>
								))}
							</ul>
						</div>
						{FOOTER_COLUMNS.map(colonne => (
							<nav key={colonne.titre} aria-label={colonne.titre} className="flex flex-col gap-1">
								<p className="mb-3 font-display font-medium text-2xl text-indigo-800">{colonne.titre}</p>
								{colonne.liens.map(lien => (
									<Link
										key={lien.href}
										href={lien.href}
										className="inline-flex min-h-11 items-center text-mute text-sm hover:text-indigo-700"
									>
										{lien.nom}
									</Link>
								))}
							</nav>
						))}
					</div>
				</div>
			</footer>
			<Signature />
		</div>
	)
}
