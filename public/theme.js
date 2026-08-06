try {
  const savedTheme = localStorage.getItem("theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  document.documentElement.dataset.theme = savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : preferredTheme;
} catch {
  document.documentElement.dataset.theme = "light";
}

// Last-resort uncover for the loading splash. This lives here, not in main.js,
// because it has to survive main.js failing to load at all: a bad import or a
// missing config.js would leave the splash covering a working page forever.
// This file is a classic script, so it runs before the module and regardless
// of what happens to it. The CSP forbids inline scripts, hence a real file.
setTimeout(() => {
  document.getElementById("initialLoading")?.classList.add("initial-loading--hidden");
}, 8000);
