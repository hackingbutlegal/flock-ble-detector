import * as esbuild from "esbuild";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  sourcemap: true,
  outfile: "public/assets/main.js",
});

await ctx.watch();
const { port } = await ctx.serve({ servedir: "public", host: "127.0.0.1" });
console.log(`dev: http://localhost:${port}  (secure context → Web Bluetooth enabled)`);
