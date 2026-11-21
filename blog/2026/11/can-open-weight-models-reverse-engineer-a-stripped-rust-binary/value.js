// Mean score against cost per run, one labeled point per model. Colors come
// from the site's tokens and follow the color mode.
(function () {
	var canvas = document.getElementById(document.currentScript.getAttribute("data-name"));

	var models = [
		{ name: "DeepSeek V4.1 Flash", cost: 0.29, mean: 0.5 },
		{ name: "GLM 5.3", cost: 1.89, mean: 0.83 },
		{ name: "Kimi K3", cost: 1.21, mean: 0 },
		{ name: "Mistral Large 4", cost: 0.8, mean: 0 },
	];

	function token(name) {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	// Chart.js has no built-in point labels, so draw the model names directly,
	// centered above each point.
	var labels = {
		id: "labels",
		afterDatasetsDraw: function (chart) {
			var ctx = chart.ctx;
			ctx.save();
			ctx.font = "12px " + Chart.defaults.font.family;
			ctx.fillStyle = token("--color-on");
			ctx.textAlign = "center";
			ctx.textBaseline = "bottom";
			chart.getDatasetMeta(0).data.forEach(function (el, i) {
				ctx.fillText(models[i].name, el.x, el.y - 12);
			});
			ctx.restore();
		},
	};

	function config() {
		var onv = token("--color-onv");
		var grid = token("--color-outlinev");
		var title = { display: true, color: onv };

		return {
			type: "scatter",
			data: {
				datasets: [
					{
						data: models.map(function (m) {
							return { x: m.cost, y: m.mean };
						}),
						backgroundColor: token("--color-primary"),
						borderColor: token("--color-primary"),
						pointRadius: 7,
						pointHoverRadius: 9,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: {
						min: 0,
						max: 2,
						title: Object.assign({ text: "Cost per run" }, title),
						ticks: {
							color: onv,
							stepSize: 0.5,
							callback: function (v) {
								return "$" + v.toFixed(2);
							},
						},
						grid: { color: grid },
					},
					y: {
						min: -0.5,
						max: 1,
						title: Object.assign({ text: "Mean score" }, title),
						ticks: {
							color: onv,
							stepSize: 0.25,
							callback: function (v) {
								return v.toFixed(2);
							},
						},
						grid: { color: grid },
					},
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: function (ctx) {
								var m = models[ctx.dataIndex];
								return m.name + ": $" + m.cost.toFixed(2) + ", mean " + m.mean.toFixed(2);
							},
						},
					},
				},
			},
			plugins: [labels],
		};
	}

	Chart.defaults.font.family = token("--font-mono") || "monospace";
	var chart = new Chart(canvas, config());

	new MutationObserver(function () {
		chart.destroy();
		chart = new Chart(canvas, config());
	}).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
})();
