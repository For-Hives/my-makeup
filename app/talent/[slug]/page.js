import { convertMarkdownToHtml } from '@/services/utils'
import { getOneTalent } from '@/services/getOneTalent'
import { Layout } from '@/components/Global/Layout'
import getAllTalent from '@/services/getAllTalent'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

export const dynamicParams = false
export const revalidate = 10

export const generateStaticParams = async () => {
	const talentList = await getAllTalent()

	const pathList = talentList?.data?.map(record => ({
		params: {
			slug: record.attributes.slug,
		},
	}))

	return pathList || []
}

export const generateMetadata = async ({ params }) => {
	const talent = await getOneTalent(params.slug)

	const meta = talent?.attributes
	return {
		description:
			meta?.seo_description ??
			'Découvrez cet article passionnant de la part de My-Makeup',
		// seo tag canonical link
		alternates: {
			canonical: 'https://my-makeup.fr/blog/' + meta?.slug,
		},
		title: meta?.seo_title ?? 'My-Makeup',
	}
}

const Talent = async ({ params }) => {
	const talent = await getOneTalent(params.slug)
	const talentWithConvertedContent = await convertMarkdownToHtml(talent)
	const talentAttributes = talentWithConvertedContent?.attributes

	return (
		<>
			<Nav />
			<main className={'relative'}>
				<Hero
					description={<>{talentAttributes.description}</>}
					imgBackgroundSrc={'/assets/back/maquilleuse_europeenne_white.webp'}
					title={<>{talentAttributes.seo_title}</>}
				/>
				<div
					className={'relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0'}
				>
					<div className="mx-auto max-w-2xl">
						<article>
							<div className={'prose my-8 xl:prose-lg'}>
								<Layout value={talentAttributes.content.toString()} />
							</div>
							<h3 className={'flex items-center text-base text-gray-600'}>
								<span className="h-4 w-0.5 rounded-full bg-gray-200" />
								<span className="ml-3">{"L'équipe My-Makeup"}</span>
							</h3>
						</article>
					</div>
				</div>
				<CTA />
			</main>
			<Footer />
		</>
	)
}

export default Talent
