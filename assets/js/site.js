MathJax = {
	chtml: {
		fontURL: '/font/mathjax',
	},
};

if (typeof ChartjsLoaders === 'undefined') {
	var ChartjsLoaders = new Array();
}

$(document).ready(function() {
	ChartjsLoaders.forEach(function (item, index) {
		var scriptTag = document.createElement('script');
		scriptTag.setAttribute('data-name', item);
		firstScriptTag = document.getElementsByTagName('script')[0];
		scriptTag.src = item + ".js";
		firstScriptTag.parentNode.insertBefore(scriptTag, firstScriptTag);
	});
});

$(document).ready(function() {
	const zooming = new Zooming({
		bgColor: '#000',
	})

	zooming.listen('article figure > img')
});
