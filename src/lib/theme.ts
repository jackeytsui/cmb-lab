export const THEME_STORAGE_KEY = "theme";

// Runs from <head> before first paint so hard navigations, restored tabs, and
// installed/PWA launches use the same saved theme as client-side navigation.
export const THEME_BOOTSTRAP_SCRIPT =
  `(function(){try{document.documentElement.classList.toggle("dark",localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")}catch(_error){}})()`;
