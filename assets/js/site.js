// three-state theme control: auto -> dark -> light, persisted in localStorage
const ORDER = ["system", "dark", "light"];

const mq = window.matchMedia("(prefers-color-scheme: dark)");

function apply(mode) {
	const dark = mode === "system" ? mq.matches : mode === "dark";
	document.documentElement.classList.toggle("light", !dark);
	document.documentElement.dataset.mode = mode;
	document.querySelectorAll("[data-theme-icon]").forEach((el) => {
		el.querySelectorAll("[data-icon-for]").forEach((i) => {
			i.classList.toggle("hidden", i.dataset.iconFor !== mode);
		});
	});
	document.querySelectorAll("[data-theme-label]").forEach((el) => {
		el.textContent = mode === "system" ? "auto" : mode;
	});
}

apply(localStorage.getItem("eikendev-mode") || "system");
mq.addEventListener("change", () =>
	apply(document.documentElement.dataset.mode || "system"),
);

document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
	btn.addEventListener("click", () => {
		const next =
			ORDER[
				(ORDER.indexOf(
					document.documentElement.dataset.mode || "system",
				) +
					1) %
					3
			];
		localStorage.setItem("eikendev-mode", next);
		apply(next);
	});
});

// hero: rotating role label
const roleEl = document.querySelector("[data-roles]");
if (roleEl) {
	const roles = JSON.parse(roleEl.dataset.roles);
	let i = 0;
	setInterval(() => {
		roleEl.classList.add("opacity-0", "-translate-y-1");
		setTimeout(() => {
			i = (i + 1) % roles.length;
			roleEl.textContent = roles[i];
			roleEl.classList.remove("opacity-0", "-translate-y-1");
		}, 260);
	}, 2800);
}

// hero: typewriter headline
const typeEl = document.querySelector("[data-type]");
if (typeEl && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
	const full = typeEl.dataset.type;
	typeEl.textContent = "";
	let n = 0;
	const step = () => {
		typeEl.textContent = full.slice(0, ++n);
		if (n < full.length) setTimeout(step, 70);
	};
	setTimeout(step, 380);
}

// projects page: language filter chips
const filterBar = document.querySelector("[data-filters]");
if (filterBar) {
	const cards = [
		...document.querySelectorAll("[data-projects] > [data-langs]"),
	];
	const ACTIVE = ["bg-pc", "text-onpc", "border-transparent"];
	const IDLE = ["bg-transparent", "text-onv", "border-outlinev"];
	filterBar.addEventListener("click", (e) => {
		const btn = e.target.closest("[data-filter]");
		if (!btn) return;
		filterBar.querySelectorAll("[data-filter]").forEach((b) => {
			const on = b === btn;
			b.toggleAttribute("data-active", on);
			b.classList.toggle("hidden", false);
			ACTIVE.forEach((c) => b.classList.toggle(c, on));
			IDLE.forEach((c) => b.classList.toggle(c, !on));
		});
		const want = btn.dataset.filter;
		cards.forEach((c) => {
			const show =
				want === "all" || c.dataset.langs.split(" ").includes(want);
			c.classList.toggle("contents", show);
			c.classList.toggle("hidden", !show);
		});
	});
}

// article figures: click to enlarge
(function () {
	const imgs = document.querySelectorAll("article figure > img");
	if (!imgs.length) return;
	let overlay;
	const close = () => {
		if (!overlay) return;
		overlay.remove();
		overlay = null;
		document.removeEventListener("keydown", onKey);
	};
	const onKey = (e) => {
		if (e.key === "Escape") close();
	};
	imgs.forEach((img) => {
		img.style.cursor = "zoom-in";
		img.addEventListener("click", () => {
			overlay = document.createElement("div");
			overlay.style.cssText =
				"position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;" +
				"padding:5vmin;background:rgba(0,0,0,.85);cursor:zoom-out;animation:rise .2s ease both";
			const big = document.createElement("img");
			big.src = img.currentSrc || img.src;
			big.alt = img.alt;
			big.style.cssText =
				"max-width:100%;max-height:100%;border-radius:12px";
			overlay.appendChild(big);
			overlay.addEventListener("click", close);
			document.body.appendChild(overlay);
			document.addEventListener("keydown", onKey);
		});
	});
})();
