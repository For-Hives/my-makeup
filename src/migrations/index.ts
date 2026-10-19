import * as migration_20261019_142224_init from './20261019_142224_init'

export const migrations = [
	{
		up: migration_20261019_142224_init.up,
		down: migration_20261019_142224_init.down,
		name: '20261019_142224_init',
	},
]
