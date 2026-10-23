/**
 * Reading a secret at the keyboard: the terminal is put in raw mode, so that what is typed is
 * not shown, and no character of it is ever written back. Only a real terminal is accepted: a
 * password read from a pipe, a file or the environment would leave a trace in a history or a log.
 */

import { CreationRefused } from './account'

/** The characters a line of raw input holds, once its control keys are handled. */
export type Keypress = { fin: true; saisie: string } | { annule: true } | { saisie: string }

/**
 * Applies what a terminal sent to what was typed so far: Enter ends the line, Ctrl+C and Ctrl+D
 * cancel, Backspace removes a character, other control characters are ignored. Pure, so that a
 * test plays it.
 */
export function apply(saisie: string, recu: string): Keypress {
	let current = saisie
	for (const character of recu) {
		if (character === '\r' || character === '\n') return { fin: true, saisie: current }
		if (character === '\u0003' || character === '\u0004') return { annule: true }
		if (character === '\u007f' || character === '\b') current = Array.from(current).slice(0, -1).join('')
		else if (character >= ' ') current += character
	}
	return { saisie: current }
}

/** Asks `question`, reads the answer without showing it. Refuses a standard input that is not a terminal. */
export function readSecret(question: string): Promise<string> {
	const { stdin, stdout } = process
	if (!stdin.isTTY || !stdout.isTTY)
		throw new CreationRefused(
			'Le mot de passe se tape au clavier, dans un terminal : il ne se lit ni dans un fichier, ni dans un tube, ni dans une variable.'
		)
	stdout.write(question)
	return new Promise((resolve, reject) => {
		let typed = ''
		const finish = () => {
			stdin.off('data', onData)
			stdin.setRawMode(false)
			stdin.pause()
			stdout.write('\n')
		}
		const onData = (morceau: Buffer | string) => {
			const key = apply(typed, morceau.toString('utf8'))
			if ('annule' in key) {
				finish()
				reject(new CreationRefused('Saisie annulée. Rien n’est écrit.'))
				return
			}
			typed = key.saisie
			if ('fin' in key) {
				finish()
				resolve(typed)
			}
		}
		stdin.setRawMode(true)
		stdin.resume()
		stdin.on('data', onData)
	})
}
