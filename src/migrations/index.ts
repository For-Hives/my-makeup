import * as migration_20261019_151825_init from './20261019_151825_init'
import * as migration_20261020_215218_zone_countries_postal_codes from './20261020_215218_zone_countries_postal_codes'
import * as migration_20261021_120000_media_object_missing from './20261021_120000_media_object_missing'

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
	{
		up: migration_20261021_120000_media_object_missing.up,
		down: migration_20261021_120000_media_object_missing.down,
		name: '20261021_120000_media_object_missing',
	},
]
