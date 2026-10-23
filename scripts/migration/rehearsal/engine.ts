/**
 * How the rehearsal reaches the PostgreSQL tools: through the PostgreSQL container of its bench,
 * whose version is the server's. A `pg_restore` or `pg_dump` of the host may be older than the
 * server (a backup made by 18 does not open under 16), the container's never is.
 */

import { composeVariables, FILE_COMPOSE, type Instance, type Services } from '../../../tests/support/bench'
import { containersEngine } from '../../bench'

/** The superuser of the bench database (compose.test.yml). */
export const BENCH_DATABASE_USER = 'banc'

/** The command and the environment that run a program inside the PostgreSQL container of the bench. */
export async function inContainer(
	instance: Instance,
	services: Services,
	program: readonly string[]
): Promise<{ command: string[]; env: Record<string, string> }> {
	const engine = await containersEngine()
	const env: Record<string, string> = {}
	for (const [name, value] of Object.entries({ ...engine, ...composeVariables(instance, services) }))
		if (value !== undefined) env[name] = value
	return {
		command: [
			'docker',
			'compose',
			'--project-name',
			instance.nom,
			'--file',
			FILE_COMPOSE,
			'exec',
			'-T',
			'postgres',
			...program,
		],
		env,
	}
}
