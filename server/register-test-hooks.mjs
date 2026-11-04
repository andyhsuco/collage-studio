import { register } from "node:module";

// Node runs these tests as TypeScript, but the server graph imports ".js"
// so Vercel can load the compiled functions. Map those specifiers back to ".ts".
register("./ts-js-resolver.mjs", import.meta.url);
