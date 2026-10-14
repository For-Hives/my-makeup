import * as migration_20261014_134242_init from './20261014_134242_init'
import * as migration_20261014_173900_sizes_des_medias from './20261014_173900_sizes_des_medias'
import * as migration_20261014_175557_pros_sans_verrou_de_compte from './20261014_175557_pros_sans_verrou_de_compte'
import * as migration_20261014_190000_admins_sans_verrou_de_compte from './20261014_190000_admins_sans_verrou_de_compte'
import * as migration_20261014_190215_auth_journal_et_derniere_connexion from './20261014_190215_auth_journal_et_derniere_connexion'
import * as migration_20261014_202841_auth_blocage from './20261014_202841_auth_blocage'
import * as migration_20261014_202952_auth_evenements_heritee from './20261014_202952_auth_evenements_heritee'
import * as migration_20261014_203454_auth_oubli_journal from './20261014_203454_auth_oubli_journal'
import * as migration_20261014_203529_google_methode_du_journal from './20261014_203529_google_methode_du_journal'
import * as migration_20261014_203606_inscription_antispam from './20261014_203606_inscription_antispam'
import * as migration_20261014_215710_integration_vague4 from './20261014_215710_integration_vague4'

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
		up: migration_20261014_190000_admins_sans_verrou_de_compte.up,
		down: migration_20261014_190000_admins_sans_verrou_de_compte.down,
		name: '20261014_190000_admins_sans_verrou_de_compte',
	},
	{
		up: migration_20261014_190215_auth_journal_et_derniere_connexion.up,
		down: migration_20261014_190215_auth_journal_et_derniere_connexion.down,
		name: '20261014_190215_auth_journal_et_derniere_connexion',
	},
	{
		up: migration_20261014_202841_auth_blocage.up,
		down: migration_20261014_202841_auth_blocage.down,
		name: '20261014_202841_auth_blocage',
	},
	{
		up: migration_20261014_202952_auth_evenements_heritee.up,
		down: migration_20261014_202952_auth_evenements_heritee.down,
		name: '20261014_202952_auth_evenements_heritee',
	},
	{
		up: migration_20261014_203454_auth_oubli_journal.up,
		down: migration_20261014_203454_auth_oubli_journal.down,
		name: '20261014_203454_auth_oubli_journal',
	},
	{
		up: migration_20261014_203529_google_methode_du_journal.up,
		down: migration_20261014_203529_google_methode_du_journal.down,
		name: '20261014_203529_google_methode_du_journal',
	},
	{
		up: migration_20261014_203606_inscription_antispam.up,
		down: migration_20261014_203606_inscription_antispam.down,
		name: '20261014_203606_inscription_antispam',
	},
	{
		up: migration_20261014_215710_integration_vague4.up,
		down: migration_20261014_215710_integration_vague4.down,
		name: '20261014_215710_integration_vague4',
	},
]
