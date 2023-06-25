import { signOut } from 'next-auth/react'
import { useRouter } from 'next/router'

function DangerZone() {
	const router = useRouter()

	return (
		<>
			<div className="relative mt-8">
				<div className="absolute inset-0 flex items-center" aria-hidden="true">
					<div className="w-full border-t border-gray-300" />
				</div>
				<div className="relative flex justify-center">
					<span className="bg-white px-3 text-base font-semibold leading-6 text-gray-900">
						Zone de danger
					</span>
				</div>
			</div>
			<div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-3xl">
					<div className="border-1 overflow-hidden rounded-lg border  border-red-500 bg-white shadow">
						<div className="px-4 py-5 sm:p-6">
							<div className="flex flex-col items-center justify-center">
								<div className="flex flex-col gap-4">
									<div className="flex flex-col gap-2">
										<h2 className="text-xl font-bold text-gray-700">
											Se déconnecter
										</h2>
										<p className="text-gray-600">
											Vous serez déconnecté de votre compte
										</p>
									</div>
									<button
										className="flex items-center justify-center gap-2 rounded-md bg-red-500 px-4 py-2 text-white"
										onClick={() => {
											signOut()
											router.push('/')
										}}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											className="h-6 w-6 text-white"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
										<span>Me déconnecter</span>
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default DangerZone
