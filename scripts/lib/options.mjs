// Node/scanner entry point for the options fair-value math. Single source of truth
// lives in web/options.mjs (also browser-served by Vercel), re-exported here so the
// scanner and tests can use it without duplicating the math.
export * from "../../web/options.mjs";
