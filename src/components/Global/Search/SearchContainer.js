'use client'

import { useReducer } from 'react'

import { useSearchParams } from 'next/navigation'

import { getMakeupArtist } from '@/services/getMakeupArtist'

import MakeupArtistCatalog from './MakeupArtistCatalog'
import SearchForm from './SearchForm'

const reducer = (state, action) => {
	switch (action.type) {
		case 'error': {
			return {
				...state,
				error: action.error,
				status: 'rejected',
			}
		}
		case 'success': {
			return {
				...state,
				MakeupArtistList: action.MakeupArtistList,
				status: 'resolved',
			}
		}
		case 'started': {
			return {
				...state,
				status: 'pending',
			}
		}
		// TODO Create ErrorBoundary with fallback to manage this error and display view for user
		// default: {
		// 	throw new Error(`Unhandled action type: ${action.type}`)
		// }
	}
}

const SearchContainer = () => {
	const search = useSearchParams().get('search')
	const city = useSearchParams().get('city')
	const [{ MakeupArtistList, status, error }, dispatch] = useReducer(reducer, {
		status: 'idle',
	})

	const onSubmit = async e => {
		e.preventDefault()
		dispatch({ type: 'started' })
		getMakeupArtist({ search, city })
			.then(res => dispatch({ MakeupArtistList: res, type: 'success' }))
			.catch(err => dispatch({ type: 'error', error: err }))
	}

	return (
		<>
			<SearchForm onSubmit={onSubmit} />
			<MakeupArtistCatalog
				MakeupArtistList={MakeupArtistList}
				status={status}
			/>
		</>
	)
}

export default SearchContainer
