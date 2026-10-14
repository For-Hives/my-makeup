import config from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { lireLeProfilPublic } from '@/services/public/profils'

// Read at each request: the build runs without a database. The refresh by tags of ticket 047 and
// the page of ticket 101 come after this first slice.
export const dynamic = 'force-dynamic'

/**
 * The public page of a profile, first slice (ticket 026): the name of the makeup artist in the
 * only h1, her speciality and her description, all in the HTML of the server. An unknown or
 * unpublished slug answers 404. The profile is read by the public reading only
 * (src/services/public/profils.ts), which never gives a contact detail.
 */
export default async function PageDuProfil({ params }: PageProps<'/profil/[slug]'>) {
	const { slug } = await params
	const profil = await lireLeProfilPublic(await getPayload({ config }), slug)
	if (!profil) notFound()
	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6">
			<h1 className="break-words font-bold text-3xl text-neutral-800 tracking-tight">{profil.nom}</h1>
			{profil.specialite && <p className="font-semibold text-neutral-700 text-xl">{profil.specialite}</p>}
			{profil.description && (
				<p className="whitespace-pre-line break-words text-neutral-700 leading-relaxed">{profil.description}</p>
			)}
		</main>
	)
}
