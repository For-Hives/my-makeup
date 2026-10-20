import { afterAll, describe, expect, spyOn, test } from 'bun:test'
import net from 'node:net'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { type DomWindow, openWindow, SET_NAMES } from '../support/dom-react'

// The component bench, tested on components that exist only here: no page of the site is involved.

/** Read while bun loads this file, before any window opens: what the preload left behind. */
const LOADING = { document: typeof document, window: typeof window }

/** Both ways out to the network are watched from here to the end of the file: none may be taken. */
const outputs = [spyOn(globalThis, 'fetch'), spyOn(net.Socket.prototype, 'connect')]
afterAll(() => {
	for (const output of outputs) output.mockRestore()
})

function Counter() {
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
	const [firstName, setFirstName] = useState('')
	const [specialty, setSpecialty] = useState('mariee')
	const [available, setAvailable] = useState(false)
	return (
		<section>
			<label>
				Prénom
				<input value={firstName} onChange={event => setFirstName(event.target.value)} />
			</label>
			<label>
				Spécialité
				<select value={specialty} onChange={event => setSpecialty(event.target.value)}>
					<option value="mariee">Mariée</option>
					<option value="cinema">Cinéma</option>
				</select>
			</label>
			<label>
				<input type="checkbox" checked={available} onChange={event => setAvailable(event.target.checked)} />
				Disponible
			</label>
			<p>{`${firstName || 'Sans prénom'}, ${specialty}${available ? ', disponible' : ''}`}</p>
		</section>
	)
}

function Identity({ enregistrer }: { enregistrer: (valeurs: { prenom: string }) => void }) {
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

function Loading({ charger: load }: { charger: () => Promise<string> }) {
	const [city, setCity] = useState<string>()
	return (
		<section>
			<button type="button" onClick={() => void load().then(setCity)}>
				Charger
			</button>
			{city && <p data-ville>{city}</p>}
		</section>
	)
}

function Sentinel({ journal: log }: { journal: string[] }) {
	useEffect(() => {
		log.push('monté')
		return () => {
			log.push('démonté')
		}
	}, [log])
	return <p>Témoin</p>
}

/** The window of the first block, kept to be asked once its tests are over. */
let renderedWindow: DomWindow | undefined

describe('the component bench', () => {
	const jsdomWindow = openWindow({ noms: ['localStorage'] })
	renderedWindow = jsdomWindow

	test('renders a component, clicks, and reads the updated text', async () => {
		const zone = await jsdomWindow.monter(<Counter />)
		expect(zone.querySelector('p')?.textContent).toBe('Aucun clic')

		await jsdomWindow.cliquer(jsdomWindow.bouton('Ajouter'))
		expect(zone.querySelector('p')?.textContent).toBe('1 clic')

		await jsdomWindow.cliquer(jsdomWindow.bouton('Ajouter'))
		expect(zone.querySelector('p')?.textContent).toBe('2 clics')
	})

	test('each test starts from an empty page', () => {
		expect(jsdomWindow.w.document.body.childElementCount).toBe(0)
	})

	test('typing in a field reaches onChange: React was loaded with a window', async () => {
		const zone = await jsdomWindow.monter(<Presentation />)

		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'Léa')
		expect(zone.querySelector('p')?.textContent).toBe('Léa, mariee')
		expect(jsdomWindow.w.document.activeElement).toBe(jsdomWindow.champ('Prénom'))

		// The label of a list is its own words, not those of its options.
		await jsdomWindow.saisir(jsdomWindow.champ('Spécialité'), 'cinema')
		expect(zone.querySelector('p')?.textContent).toBe('Léa, cinema')

		// A checkbox is clicked, not typed in.
		await jsdomWindow.cliquer(jsdomWindow.champ('Disponible'))
		expect(zone.querySelector('p')?.textContent).toBe('Léa, cinema, disponible')
	})

	test('a form of react-hook-form refuses, accepts, and resets the native form', async () => {
		const received: { prenom: string }[] = []
		const zone = await jsdomWindow.monter(<Identity enregistrer={valeurs => received.push(valeurs)} />)

		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		expect(zone.querySelector('[role="alert"]')?.textContent).toBe('Le prénom est obligatoire')
		expect(received).toEqual([])

		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'Léa')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		expect(zone.querySelector('[role="alert"]')).toBeNull()
		expect(received).toEqual([{ prenom: 'Léa' }])

		// Loaded without a window, react-hook-form would leave the native form alone.
		await jsdomWindow.saisir(jsdomWindow.champ('Note'), 'autre chose')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Annuler'))
		expect(jsdomWindow.champ('Note').value).toBe('brouillon')
		expect(jsdomWindow.champ('Prénom').value).toBe('')
	})

	test('waits for what a promise brings, without a fixed delay', async () => {
		let respond: (ville: string) => void = () => {}
		const load = () => new Promise<string>(resolve => (respond = resolve))
		const zone = await jsdomWindow.monter(<Loading charger={load} />)

		await jsdomWindow.cliquer(jsdomWindow.bouton('Charger'))
		expect(zone.querySelector('[data-ville]')).toBeNull()

		respond('Annecy')
		const city = await jsdomWindow.attendre(() => zone.querySelector('[data-ville]'))
		expect(city.textContent).toBe('Annecy')

		await expect(jsdomWindow.attendre(() => zone.querySelector('[data-absent]'), { max: 20 })).rejects.toThrow(
			'Attente dépassée : rien au bout de 20 ms.'
		)
	})

	test('unmounting is a real unmount: the effects are cleaned up', async () => {
		const log: string[] = []
		await jsdomWindow.monter(<Sentinel journal={log} />)
		expect(log).toEqual(['monté'])

		await jsdomWindow.demonter()
		expect(log).toEqual(['monté', 'démonté'])
		expect(jsdomWindow.w.document.body.childElementCount).toBe(0)
	})

	test('a button or a field is found by its name, or the error lists what the page offers', async () => {
		await jsdomWindow.monter(<Identity enregistrer={() => {}} />)

		expect(jsdomWindow.bouton(/^Enreg/).textContent).toBe('Enregistrer')
		expect(() => jsdomWindow.bouton('Supprimer')).toThrow(
			'Aucun bouton ne répond à Supprimer. Dans la page : « Enregistrer », « Annuler ».'
		)
		expect(() => jsdomWindow.bouton(/e/)).toThrow('2 boutons répondent à /e/.')
		expect(() => jsdomWindow.champ('Nom')).toThrow('Aucun champ ne répond à Nom. Dans la page : « Prénom », « Note ».')
		await expect(jsdomWindow.saisir(jsdomWindow.bouton('Annuler'), 'x')).rejects.toThrow(
			'On ne saisit que dans un champ (input, textarea, select), pas dans <button>.'
		)
	})

	test('a test file sees the window under the names of a browser', () => {
		const globals = globalThis as unknown as Record<string, unknown>
		for (const name of [...SET_NAMES, 'localStorage'])
			expect(globals[name], name).toBe(Reflect.get(jsdomWindow.w, name))
		expect(new FormData(jsdomWindow.w.document.createElement('form'))).toBeInstanceOf(jsdomWindow.w.FormData)
		localStorage.setItem('essai', 'oui')
		expect(jsdomWindow.w.localStorage.getItem('essai')).toBe('oui')

		// What reaches the network or the clock stays bun's, and the window offers no fetch of its own.
		for (const name of ['URL', 'AbortController', 'setTimeout']) {
			expect(globals[name], name).not.toBe(Reflect.get(jsdomWindow.w, name))
		}
		expect(Reflect.get(jsdomWindow.w, 'fetch')).toBeUndefined()
	})

	test('the window has no way out to the network', () => {
		expect(() => new jsdomWindow.w.XMLHttpRequest()).toThrow("Le banc de composants n'a pas de réseau : XMLHttpRequest")
		expect(() => new jsdomWindow.w.WebSocket('ws://localhost/')).toThrow(
			"Le banc de composants n'a pas de réseau : WebSocket"
		)
	})
})

describe('around the window', () => {
	test('the preload left no window behind', () => {
		expect(LOADING).toEqual({ document: 'undefined', window: 'undefined' })
	})

	test('the window is given back after its last test', () => {
		for (const name of ['window', 'document', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']) {
			expect(name in globalThis, name).toBe(false)
		}
		expect(navigator.userAgent).toStartWith('Bun/')
		expect(new FormData()).toBeInstanceOf(FormData)
	})

	test('a helper called outside the tests of its window says so', async () => {
		expect(() => renderedWindow?.w).toThrow("La fenêtre n'est ouverte que pendant les tests")
		await expect(renderedWindow?.monter(<Counter />)).rejects.toThrow("La fenêtre n'est ouverte que pendant les tests")
	})

	test('nothing went out: no fetch, no socket, from the opening of the window to its end', () => {
		for (const output of outputs) expect(output).not.toHaveBeenCalled()
	})
})
