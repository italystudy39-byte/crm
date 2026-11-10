export const THEME_KEY = "crm-theme";

/** Inline script for <head>: applies the saved theme before first paint. */
export const THEME_SCRIPT = `(function(){try{var m=localStorage.getItem("${THEME_KEY}");var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;
