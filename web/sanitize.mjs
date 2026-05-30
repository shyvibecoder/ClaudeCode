// HTML/URL sanitizers for untrusted third-party strings (RSS news, EDGAR filings)
// before they go into innerHTML. Prevents stored XSS. Pure (browser + Node).
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const safeUrl = (u) => {
  try { const x = new URL(String(u)); return (x.protocol === "http:" || x.protocol === "https:") ? x.href : "#"; }
  catch { return "#"; }
};
