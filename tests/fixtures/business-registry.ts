/**
 * Simulated answers of the public business registry (issue 1004), shaped like the real ones for the fields the
 * service reads, with made-up numbers and names. No test reaches the real registry (docs/tests/http-sortant.md).
 */
import { HttpResponse } from '../support/outgoing-http'

/** Luhn-valid numbers that belong to nobody. */
export const SIRET_ACTIVE = '00000000100016'
export const SIRET_CEASED = '00000000200014'
export const SIRET_UNKNOWN = '12345678901237'

type Establishment = { siret: string; etat_administratif: string }

const company = (siren: string, unit: string, siege: Establishment, matching: Establishment[]) => ({
	siren,
	nom_complet: 'ENTREPRISE FICTIVE',
	etat_administratif: unit,
	siege,
	matching_etablissements: matching,
})

const page = (results: unknown[]) => ({ results, total_results: results.length, page: 1, per_page: 10, total_pages: 1 })

export const body = {
	active: (siret = SIRET_ACTIVE) =>
		page([company(siret.slice(0, 9), 'A', { siret, etat_administratif: 'A' }, [{ siret, etat_administratif: 'A' }])]),
	/** The establishment is closed, the legal unit too. */
	ceased: (siret = SIRET_CEASED) =>
		page([company(siret.slice(0, 9), 'C', { siret, etat_administratif: 'F' }, [{ siret, etat_administratif: 'F' }])]),
	/** The legal unit lives on, but this establishment is closed. */
	closedEstablishment: (siret = SIRET_CEASED) =>
		page([
			company(siret.slice(0, 9), 'A', { siret: `${siret.slice(0, 9)}99999`, etat_administratif: 'A' }, [
				{ siret, etat_administratif: 'F' },
			]),
		]),
	/** The establishment is open but the legal unit is ceased. */
	ceasedUnit: (siret = SIRET_CEASED) =>
		page([company(siret.slice(0, 9), 'C', { siret, etat_administratif: 'A' }, [{ siret, etat_administratif: 'A' }])]),
	notFound: () => page([]),
	/** Several results, only one holds the establishment asked for. */
	several: (siret = SIRET_ACTIVE) =>
		page([
			company('999999999', 'A', { siret: '99999999900011', etat_administratif: 'A' }, []),
			company(siret.slice(0, 9), 'A', { siret, etat_administratif: 'A' }, [{ siret, etat_administratif: 'A' }]),
		]),
	/** Several results, none holds the establishment asked for. */
	severalWithout: () =>
		page([
			company('999999999', 'A', { siret: '99999999900011', etat_administratif: 'A' }, []),
			company('888888888', 'A', { siret: '88888888800011', etat_administratif: 'A' }, []),
		]),
	/** Two rows for the same number that disagree. */
	contradictory: (siret = SIRET_ACTIVE) =>
		page([company(siret.slice(0, 9), 'A', { siret, etat_administratif: 'A' }, [{ siret, etat_administratif: 'F' }])]),
	/** A state the service does not know. */
	unknownState: (siret = SIRET_ACTIVE) =>
		page([company(siret.slice(0, 9), 'A', { siret, etat_administratif: '?' }, [{ siret, etat_administratif: '?' }])]),
}

export const reply = {
	json: (data: unknown) => HttpResponse.json(data as Record<string, unknown>),
	invalidJson: () =>
		new HttpResponse('{"results": [', { status: 200, headers: { 'content-type': 'application/json' } }),
	html: () => new HttpResponse('<html>Maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
	status: (code: number) => new HttpResponse(null, { status: code }),
	error: () => HttpResponse.error(),
	tooMany: () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '30' } }),
}
