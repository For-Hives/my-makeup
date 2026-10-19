import * as migration_20261019_143951_init from './20261019_143951_init'

export const migrations = [
	{
		up: migration_20261019_143951_init.up,
		down: migration_20261019_143951_init.down,
		name: '20261019_143951_init',
	},
]
