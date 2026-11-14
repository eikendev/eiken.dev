// Every run of every model on the score axis, with each model's mean as a
// vertical tick. Colors come from the site's tokens and follow the color mode.
(function () {
	var canvas = document.getElementById(document.currentScript.getAttribute("data-name"));

	var models = ["DeepSeek V4.1 Flash", "GLM 5.3", "Kimi K3", "Mistral Large 4"];
	var runs = [
		[1, -0.5, 1],
		[0.5, 1, 1],
		[-0.5, 1, -0.5],
		[1, -0.5, -0.5],
	];
	var outcomes = [
		{ score: 1, label: "Right", token: "--color-sev-low" },
		{ score: 0.5, label: "Mostly right", token: "--color-sev-medium" },
		{ score: -0.5, label: "Wrong", token: "--color-sev-critical" },
	];
	var axis = { "-0.5": "✗ wrong", 0: "unknown", 0.5: "½ mostly", 1: "✓ right" };

	function token(name) {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	function points(score) {
		var out = [];
		runs.forEach(function (scores, m) {
			var same = scores.filter(function (s) {
				return s === score;
			}).length;
			var k = 0;
			scores.forEach(function (s, r) {
				// Stack equal scores around the row line so they don't overlap.
				if (s !== score) return;
				out.push({ x: s, y: m + (k - (same - 1) / 2) * 0.3, model: models[m], run: r + 1 });
				k++;
			});
		});
		return out;
	}

	function config() {
		var on = token("--color-on");
		var onv = token("--color-onv");
		var grid = token("--color-outlinev");
		var datasets = outcomes.map(function (o) {
			return {
				label: o.label,
				data: points(o.score),
				backgroundColor: token(o.token),
				borderColor: token(o.token),
				pointRadius: 6,
				pointHoverRadius: 8,
			};
		});
		datasets.push({
			label: "Mean",
			data: runs.map(function (scores, m) {
				var mean =
					scores.reduce(function (a, b) {
						return a + b;
					}, 0) / scores.length;
				return { x: mean, y: m, model: models[m], mean: true };
			}),
			pointStyle: "line",
			rotation: 90,
			pointRadius: 16,
			pointHoverRadius: 16,
			borderWidth: 3,
			borderColor: token("--color-primary"),
			backgroundColor: token("--color-primary"),
		});

		return {
			type: "scatter",
			data: { datasets: datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: {
						min: -0.75,
						max: 1.25,
						afterBuildTicks: function (scale) {
							scale.ticks = [-0.5, 0, 0.5, 1].map(function (v) {
								return { value: v };
							});
						},
						ticks: {
							color: onv,
							callback: function (v) {
								return axis[v];
							},
						},
						grid: { color: grid },
					},
					y: {
						min: -0.5,
						max: 3.5,
						reverse: true,
						afterBuildTicks: function (scale) {
							scale.ticks = models.map(function (_, i) {
								return { value: i };
							});
						},
						ticks: {
							color: on,
							callback: function (v) {
								return models[v];
							},
						},
						grid: { display: false },
					},
				},
				plugins: {
					legend: { labels: { color: onv, usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
					tooltip: {
						callbacks: {
							label: function (ctx) {
								var p = ctx.raw;
								if (p.mean) return p.model + ": mean " + p.x.toFixed(2);
								return p.model + ", run " + p.run + ": " + ctx.dataset.label.toLowerCase();
							},
						},
					},
				},
			},
		};
	}

	Chart.defaults.font.family = token("--font-mono") || "monospace";
	var chart = new Chart(canvas, config());

	new MutationObserver(function () {
		chart.destroy();
		chart = new Chart(canvas, config());
	}).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
})();
