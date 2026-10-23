/**
 * Validates renovate.json with Renovate's own validator, in strict mode: an unknown option, a
 * schedule or an expression Renovate cannot read, or a setting written the old way, fails.
 *
 *   bun run renovate:validate
 *
 * To run after every change of renovate.json, and before the switch: the guard of tests/ci
 * freezes what the rules decide, this command asks Renovate whether it can read them.
 *
 * The validator runs in the official Renovate image, pinned by its tag and its digest. The
 * container has no network and no folder of this machine: it receives the configuration on
 * its standard input, and nothing else. It needs the `docker` command, and nothing else.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '../..')

/** The file Renovate reads, on the default branch only. */
export const CONFIG_FILE = 'renovate.json'

/**
 * The official image of Renovate. A version of 7 days at least when it is pinned, without any
 * open advisory in the GitHub database nor among the advisories of renovatebot/renovate, and
 * always with its digest. To move it: docs/qualite.md, « Renovate ».
 */
export const VALIDATOR_IMAGE =
	'ghcr.io/renovatebot/renovate:44.140.0@sha256:7c1f8ef90ac394f44368e1ab65e014ea51b76acab7d55a28f9c79740cf8da0dc'

/**
 * What runs in the container. `--no-global` reads the file as the configuration of a
 * repository: an option reserved to the people who host Renovate is then refused. `--strict`
 * also fails on a warning and on a setting Renovate would have to rewrite.
 */
const VALIDATOR_SCRIPT = [
	'mkdir /tmp/depot',
	'cd /tmp/depot',
	`cat > ${CONFIG_FILE}`,
	`renovate-config-validator --strict --no-global ${CONFIG_FILE}`,
].join(' && ')

/** The arguments given to `docker`: no network, no volume, the configuration on standard input. */
export function validatorArguments(image: string = VALIDATOR_IMAGE): string[] {
	return ['run', '--rm', '--interactive', '--network', 'none', image, 'sh', '-c', VALIDATOR_SCRIPT]
}

function main(): void {
	const config = readFileSync(path.join(ROOT, CONFIG_FILE))
	let code: number
	try {
		code = Bun.spawnSync(['docker', ...validatorArguments()], {
			stdin: config,
			stdout: 'inherit',
			stderr: 'inherit',
		}).exitCode
	} catch {
		console.error('La commande « docker » est introuvable : elle lance le validateur de Renovate.')
		process.exit(1)
	}
	if (code !== 0) {
		console.error(`${CONFIG_FILE} n’est pas validé (code ${code}) : le message de Renovate ou de docker est ci-dessus.`)
		process.exit(1)
	}
	console.log(`${CONFIG_FILE} est valide pour Renovate, en mode strict.`)
}

if (import.meta.main) main()
