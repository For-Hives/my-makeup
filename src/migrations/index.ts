import * as migration_20261014_134242_init from './20261014_134242_init'
import * as migration_20261014_173900_sizes_des_medias from './20261014_173900_sizes_des_medias'
import * as migration_20261014_175557_pros_sans_verrou_de_compte from './20261014_175557_pros_sans_verrou_de_compte'
import * as migration_20261014_190215_auth_journal_et_derniere_connexion from './20261014_190215_auth_journal_et_derniere_connexion'

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
	{
		up: migration_20261014_175557_pros_sans_verrou_de_compte.up,
		down: migration_20261014_175557_pros_sans_verrou_de_compte.down,
		name: '20261014_175557_pros_sans_verrou_de_compte',
	},
	{
		up: migration_20261014_190215_auth_journal_et_derniere_connexion.up,
		down: migration_20261014_190215_auth_journal_et_derniere_connexion.down,
		name: '20261014_190215_auth_journal_et_derniere_connexion',
	},
]
