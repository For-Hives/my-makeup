import * as migration_20261014_010035_socle_provisoire from './20261014_010035_socle_provisoire'

export const migrations = [
	{
		up: migration_20261014_010035_socle_provisoire.up,
		down: migration_20261014_010035_socle_provisoire.down,
		name: '20261014_010035_socle_provisoire',
	},
]
