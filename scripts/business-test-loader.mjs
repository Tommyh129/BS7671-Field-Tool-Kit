import { register } from "node:module";
register("./typescript-test-loader.mjs", import.meta.url);
register("./business-test-resolver.mjs", import.meta.url);
