// Shim: the canonical entry-quality engine lives in web/ so the browser (buy plan) can import it directly;
// Node (tests) imports it through here. Pure, no Node deps. See web/entry.mjs.
export * from "../../web/entry.mjs";
