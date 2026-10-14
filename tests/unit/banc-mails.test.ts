import { afterEach, describe, expect, test } from 'bun:test'
import { createServer, type Server, type Socket } from 'node:net'
import { BancRefuse, environnementDuBanc } from '../outils/banc'
import { DELAI_D_UNE_REQUETE_MS } from '../outils/banc-requete'
import { EnvironnementRefuse } from '../outils/garde-environnement'
import {
	attendreLeMail,
	type Capteur,
	capteurDuBanc,
	compterLesMails,
	DELAI_D_ATTENTE_MS,
	extraireLesLiens,
	lienDuMail,
	mailsRecus,
	viderLeCapteur,
} from '../outils/mailpit'

const BANC = environnementDuBanc({ nom: 'my-makeup-test', decalage: 0 })
const SITE = 'http://localhost:3100'

/** What a test has to close when it ends, whatever happened. */
const aFermer: (() => unknown)[] = []
afterEach(async () => {
	await Promise.all(aFermer.splice(0).map(fermer => fermer()))
})

/** A catcher that is not the bench: a stand-in on a local port, which answers what the test decides. */
function fauxCapteur(repondre: (url: URL, requete: Request) => Response): Capteur & { demandes: string[] } {
	const demandes: string[] = []
	const serveur = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: requete => {
			const url = new URL(requete.url)
			demandes.push(`${requete.method} ${url.pathname}`)
			return repondre(url, requete)
		},
	})
	aFermer.push(() => serveur.stop(true))
	return {
		service: 'capteur de mails',
		instance: { nom: 'faux-banc', decalage: 0 },
		api: `http://127.0.0.1:${serveur.port}`,
		demandes,
	}
}

const capteurA = (api: string): Capteur => ({
	service: 'capteur de mails',
	instance: { nom: 'banc-voisin', decalage: 20 },
	api,
})

const ecouter = (serveur: Server): Promise<number> =>
	new Promise(resolve =>
		serveur.listen(0, '127.0.0.1', () => {
			const adresse = serveur.address()
			resolve(adresse !== null && typeof adresse !== 'string' ? adresse.port : 0)
		})
	)

const echec = async (essai: Promise<unknown>): Promise<{ erreur: unknown; dureeMs: number }> => {
	const debut = performance.now()
	try {
		await essai
	} catch (erreur) {
		return { erreur, dureeMs: performance.now() - debut }
	}
	throw new Error('rien n’a échoué')
}

const refus = (essai: () => unknown): string => {
	try {
		essai()
	} catch (erreur) {
		if (erreur instanceof BancRefuse) return erreur.message
		throw erreur
	}
	throw new Error('rien n’a été refusé')
}

describe('Les liens d’un mail', () => {
	test('les liens de la partie HTML, lus comme un navigateur les lit', () => {
		const html = [
			`<p><a href="${SITE}/auth/verification?jeton=abc&amp;retour=profil">Vérifier mon adresse</a></p>`,
			`<a class='bouton' href='${SITE}/auth/reinitialiser?code=1&#38;etape=2'>Changer</a>`,
			`<A HREF=${SITE}/contact>Nous écrire</A>`,
			`<a\n\tstyle="color:#b76e79"\n\thref="${SITE}/cgu?v=1&#x26;lang=fr">Conditions</a>`,
		].join('\n')

		expect(extraireLesLiens(html)).toEqual([
			`${SITE}/auth/verification?jeton=abc&retour=profil`,
			`${SITE}/auth/reinitialiser?code=1&etape=2`,
			`${SITE}/contact`,
			`${SITE}/cgu?v=1&lang=fr`,
		])
	})

	test('seuls les liens web comptent : ni « mailto: », ni ancre, ni adresse relative, ni autre balise', () => {
		const html = [
			'<a href="mailto:contact@example.test">Nous écrire</a>',
			'<a href="tel:+33199000000">Appeler</a>',
			'<a href="#haut">Haut de page</a>',
			'<a href="/auth">Mon espace</a>',
			'<a href="javascript:void(0)">Rien</a>',
			`<abbr href="${SITE}/abbr">abréviation</abbr>`,
			`<link href="${SITE}/style.css">`,
			`<a href="${SITE}/seul">Le seul lien</a>`,
		].join('')

		expect(extraireLesLiens(html)).toEqual([`${SITE}/seul`])
	})

	test('les adresses de la partie texte, sans la ponctuation qui les suit', () => {
		const texte = [
			`Ouvre ce lien : ${SITE}/auth/verification?jeton=abc&retour=profil.`,
			`Ou celui-ci (${SITE}/auth/signin), puis « ${SITE}/contact » !`,
			'Sans lien : www.example.test et contact@example.test',
		].join('\n')

		expect(extraireLesLiens('', texte)).toEqual([
			`${SITE}/auth/verification?jeton=abc&retour=profil`,
			`${SITE}/auth/signin`,
			`${SITE}/contact`,
		])
	})

	test('chaque lien une fois, ceux de la partie HTML d’abord', () => {
		const html = `<a href="${SITE}/b">B</a> <a href="${SITE}/a?x=1&amp;y=2">A</a> <a href="${SITE}/b">B encore</a>`
		const texte = `A : ${SITE}/a?x=1&y=2\nC : ${SITE}/c\nB : ${SITE}/b`

		expect(extraireLesLiens(html, texte)).toEqual([`${SITE}/b`, `${SITE}/a?x=1&y=2`, `${SITE}/c`])
	})

	test('un mail sans lien n’en a aucun', () => {
		expect(extraireLesLiens('<p>Bonjour &amp; bienvenue</p>', 'Bonjour & bienvenue')).toEqual([])
		expect(extraireLesLiens('')).toEqual([])
	})

	test('une entité inconnue ou hors limites est laissée telle quelle', () => {
		expect(extraireLesLiens(`<a href="${SITE}/a?x=&inconnue;&#x110000;&#9999999;">A</a>`)).toEqual([
			`${SITE}/a?x=&inconnue;&#x110000;&#9999999;`,
		])
	})
})

describe('Le lien d’un mail vers une page', () => {
	const mail = {
		sujet: 'Réinitialise ton mot de passe',
		liens: [`${SITE}/auth/reinitialiser?code=jeton-temoin`, `${SITE}/contact`, `${SITE}/auth/reinitialiser/aide`],
	}

	test('par son chemin exact, ou par un motif', () => {
		expect(lienDuMail(mail, '/auth/reinitialiser')).toBe(`${SITE}/auth/reinitialiser?code=jeton-temoin`)
		expect(lienDuMail(mail, '/contact')).toBe(`${SITE}/contact`)
		expect(lienDuMail(mail, /\/aide$/)).toBe(`${SITE}/auth/reinitialiser/aide`)
	})

	test('aucun lien vers cette page : l’erreur liste les liens du mail, sans leurs paramètres', () => {
		expect(() => lienDuMail(mail, '/auth/verification')).toThrow(
			`Aucun lien vers « /auth/verification » dans le mail « Réinitialise ton mot de passe ». Ses liens, sans leurs paramètres : ${SITE}/auth/reinitialiser, ${SITE}/contact, ${SITE}/auth/reinitialiser/aide.`
		)
		expect(() => lienDuMail(mail, /verification/)).toThrow(
			`Aucun lien qui corresponde à /verification/ dans le mail « Réinitialise ton mot de passe ». Ses liens, sans leurs paramètres : ${SITE}/auth/reinitialiser, `
		)
		// A token read in a mail is never copied into a message.
		expect(() => lienDuMail(mail, /verification/)).not.toThrow(/jeton-temoin/)
	})

	test('un mail sans lien le dit', () => {
		expect(() => lienDuMail({ sujet: 'Bienvenue', liens: [] }, '/auth')).toThrow(
			'Aucun lien vers « /auth » dans le mail « Bienvenue ». Il ne contient aucun lien.'
		)
	})
})

describe('Le client ne lit et ne vide que le capteur du banc de son instance', () => {
	test('le capteur du banc est reconnu : c’est celui de .env.test', () => {
		expect(capteurDuBanc(BANC)).toEqual({
			service: 'capteur de mails',
			instance: { nom: 'my-makeup-test', decalage: 0 },
			api: 'http://127.0.0.1:8025',
		})
	})

	test('sans capteur réglé, tout s’arrête avec la commande à lancer', () => {
		expect(refus(() => capteurDuBanc({}))).toBe(
			'Aucun banc de test n’est réglé (MAILPIT_URL manque) : le capteur de mails n’est ni lu ni vidé. Démarre le banc par « bun run banc:up », puis lance les tests par « bun run test:integration ».'
		)
		expect(refus(() => capteurDuBanc({ ...BANC, SMTP_PORT: '' }))).toStartWith(
			'Aucun banc de test n’est réglé (SMTP_PORT manque)'
		)
	})

	test.each([
		['le capteur d’une autre instance', { MAILPIT_URL: 'http://127.0.0.1:8045' }, 'MAILPIT_URL'],
		['un capteur distant', { MAILPIT_URL: 'https://mailpit.example.test' }, 'MAILPIT_URL'],
		// The application would then send somewhere else than where the client reads.
		['un relais qui n’est pas celui du capteur', { SMTP_HOST: 'smtp.example.test' }, 'SMTP_HOST'],
		['le port SMTP d’une autre instance', { SMTP_PORT: '1045' }, 'SMTP_PORT'],
	])('refuse %s, sans recopier l’adresse', (_cas, variables, nom) => {
		const message = refus(() => capteurDuBanc({ ...BANC, ...variables }))

		expect(message).toStartWith(`${nom} ne désigne pas le capteur de mails du banc de test : il n’est ni lu ni vidé.`)
		for (const valeur of Object.values(variables)) expect(message).not.toContain(valeur)
	})

	test('le capteur d’une instance décalée n’est reconnu que sous les variables de cette instance', () => {
		const voisin = environnementDuBanc({ nom: 'voisin', decalage: 20 })
		const instance = { BANC_INSTANCE: 'voisin', BANC_DECALAGE: '20' }

		expect(capteurDuBanc({ ...voisin, ...instance }).api).toBe('http://127.0.0.1:8045')
		expect(() => capteurDuBanc(voisin)).toThrow(BancRefuse)
		expect(refus(() => capteurDuBanc(instance))).toContain('« BANC_INSTANCE=voisin BANC_DECALAGE=20 bun run banc:up »')
	})

	test('un capteur qui n’est pas sur ce poste est refusé avant toute requête, même donné à la main', async () => {
		const distant = capteurA('https://mailpit.example.test')

		for (const essai of [
			() => viderLeCapteur({ capteur: distant }),
			() => compterLesMails({ capteur: distant }),
			() => mailsRecus('lea@example.test', { capteur: distant }),
			() => attendreLeMail({ pour: 'lea@example.test' }, { capteur: distant }),
		]) {
			const { erreur } = await echec(essai())

			expect(erreur).toBeInstanceOf(EnvironnementRefuse)
			expect((erreur as Error).message).toStartWith('MAILPIT_URL refusée (hôte « mailpit.example.test »)')
		}
	})
})

describe('Capteur arrêté ou muet : une erreur lisible en moins de 5 secondes', () => {
	const MESSAGE = (hote: string) =>
		`Le banc de test « banc-voisin » ne répond pas : capteur de mails (${hote}).\nDémarre-le d’abord : BANC_INSTANCE=banc-voisin BANC_DECALAGE=20 bun run banc:up`

	test('arrêté : la connexion est refusée, l’erreur nomme le service, son adresse et la commande', async () => {
		const serveur = createServer()
		const port = await ecouter(serveur)
		await new Promise(resolve => serveur.close(resolve))

		const { erreur, dureeMs } = await echec(
			attendreLeMail({ pour: 'lea@example.test' }, { capteur: capteurA(`http://127.0.0.1:${port}`) })
		)

		expect(erreur).toBeInstanceOf(BancRefuse)
		expect((erreur as Error).message).toBe(MESSAGE(`127.0.0.1:${port}`))
		// Not after the wait for a mail: the first look at the mailbox is what fails.
		expect(dureeMs).toBeLessThan(1000)
	})

	test('muet : il accepte la connexion et ne dit rien, la demande est abandonnée à son délai', async () => {
		const prises: Socket[] = []
		const serveur = createServer(prise => prises.push(prise))
		const port = await ecouter(serveur)
		aFermer.push(() => {
			for (const prise of prises) prise.destroy()
			serveur.close()
		})

		const { erreur, dureeMs } = await echec(
			attendreLeMail({ pour: 'lea@example.test' }, { capteur: capteurA(`http://127.0.0.1:${port}`) })
		)

		expect(erreur).toBeInstanceOf(BancRefuse)
		expect((erreur as Error).message).toBe(MESSAGE(`127.0.0.1:${port}`))
		expect(dureeMs).toBeGreaterThanOrEqual(DELAI_D_UNE_REQUETE_MS - 100)
		expect(dureeMs).toBeLessThan(5000)
	}, 5000)

	test('l’attente d’un mail et une demande sans réponse tiennent ensemble en moins de 5 secondes', () => {
		expect(DELAI_D_ATTENTE_MS + DELAI_D_UNE_REQUETE_MS).toBeLessThan(5000)
	})
})

describe('Ce que le capteur répond', () => {
	const json = (corps: unknown): Response => Response.json(corps)
	const resume = (rang: number, adresse: string) => ({
		ID: `mail-${rang}`,
		To: [{ Name: '', Address: adresse }],
		Cc: null,
		Bcc: null,
		Subject: `Mail ${rang}`,
		// One second apart, the first one being the oldest.
		Created: new Date(Date.UTC(2026, 9, 14, 8, 0, rang)).toISOString(),
	})

	test('une recherche est lue page par page, et seule l’adresse exacte est gardée', async () => {
		const pour = 'lea@example.test'
		// 230 mails match the search of Mailpit; every tenth one is for a longer address that holds this one.
		const trouves = Array.from({ length: 230 }, (_mail, rang) => resume(rang, rang % 10 === 0 ? `zoe-${pour}` : pour))
		const recherches: (string | null)[] = []
		const capteur = fauxCapteur(url => {
			if (url.pathname !== '/api/v1/search') return new Response('', { status: 404 })
			const debut = Number(url.searchParams.get('start'))
			const limite = Number(url.searchParams.get('limit'))
			recherches.push(url.searchParams.get('query'))
			return json({ messages_count: trouves.length, messages: trouves.slice(debut, debut + limite) })
		})
		const [premier, dernier] = [resume(1, pour), resume(229, pour)]
		const lus: string[] = []
		const avecLecture = fauxCapteur(url => {
			if (url.pathname === '/api/v1/search') return json({ messages_count: 2, messages: [premier, dernier] })
			lus.push(url.pathname)
			return json({
				...dernier,
				From: { Name: 'My Makeup', Address: 'ne-pas-repondre@example.test' },
				ReplyTo: [],
				Date: dernier.Created,
				Text: 'Bonjour\r\nLéa\r\n',
				HTML: '',
			})
		})

		const { erreur } = await echec(attendreLeMail({ pour, sujet: 'Absent' }, { capteur, delaiMs: 0 }))

		expect(capteur.demandes).toEqual(['GET /api/v1/search', 'GET /api/v1/search', 'GET /api/v1/search'])
		expect([...new Set(recherches)]).toEqual([`addressed:"${pour}"`])
		expect((erreur as Error).message).toStartWith(
			`Aucun mail pour « ${pour} » dont le sujet soit « Absent » dans le capteur de mails au bout de 0 s. Cette adresse en a reçu 207, sous un autre sujet : « Mail 229 », « Mail 228 », `
		)
		// The most recent one is the one that is read, whatever the order of the answer.
		expect((await attendreLeMail({ pour }, { capteur: avecLecture })).texte).toBe('Bonjour\nLéa')
		expect(lus).toEqual(['/api/v1/message/mail-229'])
	})

	test.each([
		['une erreur', () => new Response('panne', { status: 500 }), 'a répondu 500 à la demande « chercher ».'],
		[
			'autre chose que du JSON',
			() => new Response('<html>', { status: 200 }),
			'a répondu autre chose que prévu à la demande « chercher ».',
		],
		[
			'un JSON d’une autre forme',
			() => Response.json({ messages: 'aucun' }),
			'a répondu autre chose que prévu à la demande « chercher ».',
		],
	])('%s : l’erreur dit quel service, de quel banc, à quelle demande', async (_cas, repondre, fin) => {
		const { erreur } = await echec(mailsRecus('lea@example.test', { capteur: fauxCapteur(repondre) }))

		expect((erreur as Error).message).toBe(`Le capteur de mails du banc « faux-banc » ${fin}`)
	})

	test('une remise à zéro que le capteur refuse est une erreur', async () => {
		const capteur = fauxCapteur(() => new Response('', { status: 503 }))

		const { erreur } = await echec(viderLeCapteur({ capteur }))

		expect(capteur.demandes).toEqual(['DELETE /api/v1/messages'])
		expect((erreur as Error).message).toBe(
			'Le capteur de mails du banc « faux-banc » a répondu 503 à la demande « vider ».'
		)
	})

	test('une adresse qui n’en est pas une n’est pas cherchée', async () => {
		const capteur = fauxCapteur(() => new Response('', { status: 500 }))

		for (const pour of ['', 'lea', 'lea@example.test" OR "', 'Léa Martin <lea@example.test>'])
			expect((await echec(mailsRecus(pour, { capteur }))).erreur).toEqual(
				new Error('Adresse illisible : une adresse entière est attendue.')
			)
		expect(capteur.demandes).toEqual([])
	})
})
