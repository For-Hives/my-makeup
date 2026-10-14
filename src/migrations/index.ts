import * as migration_20261014_134242_init from './20261014_134242_init'
import * as migration_20261014_173900_sizes_des_medias from './20261014_173900_sizes_des_medias'

export const migrations = [
	{
		up: migration_20261014_134242_init.up,
		down: migration_20261014_134242_init.down,
		name: '20261014_134242_init',
	},
	{
		up: migration_20261014_173900_sizes_des_medias.up,
		down: migration_20261014_173900_sizes_des_medias.down,
		name: '20261014_173900_sizes_des_medias',
	},
]
