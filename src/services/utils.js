export function classNames(...classes) {
	return classes.filter(Boolean).join(' ')
}

export function toCapitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1)
}

export function toDateLongMonthYear(date) {
	return new Date(date).toLocaleDateString('fr-FR', {
		year: 'numeric',
		month: 'long',
	})
}
