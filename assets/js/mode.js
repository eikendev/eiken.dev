// Color scheme state shared by the pre-paint snippet (mode-init.js, inlined
// in head.html) and the toggle in site.js. "system" follows the OS setting.
export const MODES = ["system", "dark", "light"];
const KEY = "eikendev-mode";
const mq = window.matchMedia("(prefers-color-scheme: dark)");

export function read() {
	try {
		return localStorage.getItem(KEY) || "system";
	} catch (e) {
		return "system";
	}
}

export function store(mode) {
	try {
		localStorage.setItem(KEY, mode);
	} catch (e) {}
}

export function current() {
	return document.documentElement.dataset.mode || "system";
}

// Flips the root class the stylesheet keys on and records the mode.
export function apply(mode) {
	const dark = mode === "system" ? mq.matches : mode === "dark";
	document.documentElement.classList.toggle("light", !dark);
	document.documentElement.dataset.mode = mode;
}

export function onSystemChange(fn) {
	mq.addEventListener("change", fn);
}
