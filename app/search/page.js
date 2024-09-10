import SearchContainer from '@/components/Global/Search/SearchContainer'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'

export const metadata = {
	// seo tag canonical link
	alternates: {
		canonical: 'https://my-makeup.fr/search',
	},
	title: 'Recherche de maquilleuse - My-Makeup',
}

const Search = () => {
	return (
		<>
			<Nav />
			<SearchContainer />
			<Footer />
		</>
	)
}

export default Search
