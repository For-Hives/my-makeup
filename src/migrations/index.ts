import * as migration_20261019_151825_init from './20261019_151825_init'
import * as migration_20261020_215218_zone_countries_postal_codes from './20261020_215218_zone_countries_postal_codes'

export const migrations = [
	{
		up: migration_20261019_151825_init.up,
		down: migration_20261019_151825_init.down,
		name: '20261019_151825_init',
	},
	{
		up: migration_20261020_215218_zone_countries_postal_codes.up,
		down: migration_20261020_215218_zone_countries_postal_codes.down,
		name: '20261020_215218_zone_countries_postal_codes',
	},
]
