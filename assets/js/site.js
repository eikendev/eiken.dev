document.addEventListener('DOMContentLoaded', function() {
	const zooming = new Zooming({
		bgColor: '#000',
	})

	zooming.listen('article figure > img')
}, false);
