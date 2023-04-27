import React from 'react'

function Loader(props) {
	return (
		<>
			<div className="loader">
				<span className="dot"></span>
				<div className="dots">
					<span></span>
					<span></span>
					<span></span>
				</div>
			</div>
		</>
	)
}

export default Loader
