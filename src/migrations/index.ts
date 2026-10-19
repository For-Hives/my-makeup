import * as migration_20261019_151825_init from './20261019_151825_init'

export const migrations = [
	{
		up: migration_20261019_151825_init.up,
		down: migration_20261019_151825_init.down,
		name: '20261019_151825_init',
	},
]
