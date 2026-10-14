import { afterAll, describe, expect, spyOn, test } from 'bun:test'
import net from 'node:net'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { type Fenetre, NOMS_POSES, ouvrirFenetre } from '../outils/dom-react'

// The component bench, tested on components that exist only here: no page of the site is involved.

/** Read while bun loads this file, before any window opens: what the preload left behind. */
const AU_CHARGEMENT = { document: typeof document, window: typeof window }

/** Both ways out to the network are watched from here to the end of the file: none may be taken. */
const sorties = [spyOn(globalThis, 'fetch'), spyOn(net.Socket.prototype, 'connect')]
afterAll(() => {
	for (const sortie of sorties) sortie.mockRestore()
})

function Compteur() {
	const [clics, setClics] = useState(0)
	return (
		<section>
			<p>{clics === 0 ? 'Aucun clic' : `${clics} clic${clics > 1 ? 's' : ''}`}</p>
			<button type="button" onClick={() => setClics(clics + 1)}>
				Ajouter
			</button>
		</section>
	)
}

function Presentation() {
	const [prenom, setPrenom] = useState('')
	const [specialite, setSpecialite] = useState('mariee')
	const [disponible, setDisponible] = useState(false)
	return (
		<section>
			<label>
				Prénom
				<input value={prenom} onChange={event => setPrenom(event.target.value)} />
			</label>
			<label>
				Spécialité
				<select value={specialite} onChange={event => setSpecialite(event.target.value)}>
					<option value="mariee">Mariée</option>
					<option value="cinema">Cinéma</option>
				</select>
			</label>
			<label>
				<input type="checkbox" checked={disponible} onChange={event => setDisponible(event.target.checked)} />
				Disponible
			</label>
			<p>{`${prenom || 'Sans prénom'}, ${specialite}${disponible ? ', disponible' : ''}`}</p>
		</section>
	)
}

function Identite({ enregistrer }: { enregistrer: (valeurs: { prenom: string }) => void }) {
	const { formState, handleSubmit, register, reset } = useForm<{ prenom: string }>({ defaultValues: { prenom: '' } })
	return (
		<form onSubmit={handleSubmit(enregistrer)}>
			<label>
				Prénom
				<input {...register('prenom', { required: 'Le prénom est obligatoire' })} />
			</label>
			{formState.errors.prenom && <p role="alert">{formState.errors.prenom.message}</p>}
			{/* A field the form library knows nothing about: only the native form can reset it. */}
			<input aria-label="Note" defaultValue="brouillon" />
			<button type="submit">Enregistrer</button>
			<button type="button" onClick={() => reset()}>
				Annuler
			</button>
		</form>
	)
}

function Chargement({ charger }: { charger: () => Promise<string> }) {
	const [ville, setVille] = useState<string>()
	return (
		<section>
			<button type="button" onClick={() => void charger().then(setVille)}>
				Charger
			</button>
			{ville && <p data-ville>{ville}</p>}
		</section>
	)
}

function Temoin({ journal }: { journal: string[] }) {
	useEffect(() => {
		journal.push('monté')
		return () => {
			journal.push('démonté')
		}
	}, [journal])
	return <p>Témoin</p>
}

/** The window of the first block, kept to be asked once its tests are over. */
let fenetreRendue: Fenetre | undefined

describe('the component bench', () => {
	const fenetre = ouvrirFenetre({ noms: ['localStorage'] })
	fenetreRendue = fenetre

	test('renders a component, clicks, and reads the updated text', async () => {
		const zone = await fenetre.monter(<Compteur />)
		expect(zone.querySelector('p')?.textContent).toBe('Aucun clic')

		await fenetre.cliquer(fenetre.bouton('Ajouter'))
		expect(zone.querySelector('p')?.textContent).toBe('1 clic')

		await fenetre.cliquer(fenetre.bouton('Ajouter'))
		expect(zone.querySelector('p')?.textContent).toBe('2 clics')
	})

	test('each test starts from an empty page', () => {
		expect(fenetre.w.document.body.childElementCount).toBe(0)
	})

	test('typing in a field reaches onChange: React was loaded with a window', async () => {
		const zone = await fenetre.monter(<Presentation />)

		await fenetre.saisir(fenetre.champ('Prénom'), 'Léa')
		expect(zone.querySelector('p')?.textContent).toBe('Léa, mariee')
		expect(fenetre.w.document.activeElement).toBe(fenetre.champ('Prénom'))

		// The label of a list is its own words, not those of its options.
		await fenetre.saisir(fenetre.champ('Spécialité'), 'cinema')
		expect(zone.querySelector('p')?.textContent).toBe('Léa, cinema')

		// A checkbox is clicked, not typed in.
		await fenetre.cliquer(fenetre.champ('Disponible'))
		expect(zone.querySelector('p')?.textContent).toBe('Léa, cinema, disponible')
	})

	test('a form of react-hook-form refuses, accepts, and resets the native form', async () => {
		const recus: { prenom: string }[] = []
		const zone = await fenetre.monter(<Identite enregistrer={valeurs => recus.push(valeurs)} />)

		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		expect(zone.querySelector('[role="alert"]')?.textContent).toBe('Le prénom est obligatoire')
		expect(recus).toEqual([])

		await fenetre.saisir(fenetre.champ('Prénom'), 'Léa')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		expect(zone.querySelector('[role="alert"]')).toBeNull()
		expect(recus).toEqual([{ prenom: 'Léa' }])

		// Loaded without a window, react-hook-form would leave the native form alone.
		await fenetre.saisir(fenetre.champ('Note'), 'autre chose')
		await fenetre.cliquer(fenetre.bouton('Annuler'))
		expect(fenetre.champ('Note').value).toBe('brouillon')
		expect(fenetre.champ('Prénom').value).toBe('')
	})

	test('waits for what a promise brings, without a fixed delay', async () => {
		let repondre: (ville: string) => void = () => {}
		const charger = () => new Promise<string>(resolve => (repondre = resolve))
		const zone = await fenetre.monter(<Chargement charger={charger} />)

		await fenetre.cliquer(fenetre.bouton('Charger'))
		expect(zone.querySelector('[data-ville]')).toBeNull()

		repondre('Annecy')
		const ville = await fenetre.attendre(() => zone.querySelector('[data-ville]'))
		expect(ville.textContent).toBe('Annecy')

		await expect(fenetre.attendre(() => zone.querySelector('[data-absent]'), { max: 20 })).rejects.toThrow(
			'Attente dépassée : rien au bout de 20 ms.'
		)
	})

	test('unmounting is a real unmount: the effects are cleaned up', async () => {
		const journal: string[] = []
		await fenetre.monter(<Temoin journal={journal} />)
		expect(journal).toEqual(['monté'])

		await fenetre.demonter()
		expect(journal).toEqual(['monté', 'démonté'])
		expect(fenetre.w.document.body.childElementCount).toBe(0)
	})

	test('a button or a field is found by its name, or the error lists what the page offers', async () => {
		await fenetre.monter(<Identite enregistrer={() => {}} />)

		expect(fenetre.bouton(/^Enreg/).textContent).toBe('Enregistrer')
		expect(() => fenetre.bouton('Supprimer')).toThrow(
			'Aucun bouton ne répond à Supprimer. Dans la page : « Enregistrer », « Annuler ».'
		)
		expect(() => fenetre.bouton(/e/)).toThrow('2 boutons répondent à /e/.')
		expect(() => fenetre.champ('Nom')).toThrow('Aucun champ ne répond à Nom. Dans la page : « Prénom », « Note ».')
		await expect(fenetre.saisir(fenetre.bouton('Annuler'), 'x')).rejects.toThrow(
			'On ne saisit que dans un champ (input, textarea, select), pas dans <button>.'
		)
	})

	test('a test file sees the window under the names of a browser', () => {
		const globaux = globalThis as unknown as Record<string, unknown>
		for (const nom of [...NOMS_POSES, 'localStorage']) expect(globaux[nom], nom).toBe(Reflect.get(fenetre.w, nom))
		expect(new FormData(fenetre.w.document.createElement('form'))).toBeInstanceOf(fenetre.w.FormData)
		localStorage.setItem('essai', 'oui')
		expect(fenetre.w.localStorage.getItem('essai')).toBe('oui')

		// What reaches the network or the clock stays bun's, and the window offers no fetch of its own.
		for (const nom of ['URL', 'AbortController', 'setTimeout']) {
			expect(globaux[nom], nom).not.toBe(Reflect.get(fenetre.w, nom))
		}
		expect(Reflect.get(fenetre.w, 'fetch')).toBeUndefined()
	})

	test('the window has no way out to the network', () => {
		expect(() => new fenetre.w.XMLHttpRequest()).toThrow("Le banc de composants n'a pas de réseau : XMLHttpRequest")
		expect(() => new fenetre.w.WebSocket('ws://localhost/')).toThrow(
			"Le banc de composants n'a pas de réseau : WebSocket"
		)
	})
})

describe('around the window', () => {
	test('the preload left no window behind', () => {
		expect(AU_CHARGEMENT).toEqual({ document: 'undefined', window: 'undefined' })
	})

	test('the window is given back after its last test', () => {
		for (const nom of ['window', 'document', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']) {
			expect(nom in globalThis, nom).toBe(false)
		}
		expect(navigator.userAgent).toStartWith('Bun/')
		expect(new FormData()).toBeInstanceOf(FormData)
	})

	test('a helper called outside the tests of its window says so', async () => {
		expect(() => fenetreRendue?.w).toThrow("La fenêtre n'est ouverte que pendant les tests")
		await expect(fenetreRendue?.monter(<Compteur />)).rejects.toThrow("La fenêtre n'est ouverte que pendant les tests")
	})

	test('nothing went out: no fetch, no socket, from the opening of the window to its end', () => {
		for (const sortie of sorties) expect(sortie).not.toHaveBeenCalled()
	})
})
