/**
 * Reading a secret at the keyboard: the terminal is put in raw mode, so that what is typed is
 * not shown, and no character of it is ever written back. Only a real terminal is accepted: a
 * password read from a pipe, a file or the environment would leave a trace in a history or a log.
 */

import { CreationRefusee } from './compte'

/** The characters a line of raw input holds, once its control keys are handled. */
export type Touche = { fin: true; saisie: string } | { annule: true } | { saisie: string }

/**
 * Applies what a terminal sent to what was typed so far: Enter ends the line, Ctrl+C and Ctrl+D
 * cancel, Backspace removes a character, other control characters are ignored. Pure, so that a
 * test plays it.
 */
export function appliquer(saisie: string, recu: string): Touche {
	let courante = saisie
	for (const caractere of recu) {
		if (caractere === '\r' || caractere === '\n') return { fin: true, saisie: courante }
		if (caractere === '\u0003' || caractere === '\u0004') return { annule: true }
		if (caractere === '\u007f' || caractere === '\b') courante = Array.from(courante).slice(0, -1).join('')
		else if (caractere >= ' ') courante += caractere
	}
	return { saisie: courante }
}

/** Asks `question`, reads the answer without showing it. Refuses a standard input that is not a terminal. */
export function lireUnSecret(question: string): Promise<string> {
	const { stdin, stdout } = process
	if (!stdin.isTTY || !stdout.isTTY)
		throw new CreationRefusee(
			'Le mot de passe se tape au clavier, dans un terminal : il ne se lit ni dans un fichier, ni dans un tube, ni dans une variable.'
		)
	stdout.write(question)
	return new Promise((resolve, reject) => {
		let saisie = ''
		const finir = () => {
			stdin.off('data', surDonnees)
			stdin.setRawMode(false)
			stdin.pause()
			stdout.write('\n')
		}
		const surDonnees = (morceau: Buffer | string) => {
			const touche = appliquer(saisie, morceau.toString('utf8'))
			if ('annule' in touche) {
				finir()
				reject(new CreationRefusee('Saisie annulée. Rien n’est écrit.'))
				return
			}
			saisie = touche.saisie
			if ('fin' in touche) {
				finir()
				resolve(saisie)
			}
		}
		stdin.setRawMode(true)
		stdin.resume()
		stdin.on('data', surDonnees)
	})
}
