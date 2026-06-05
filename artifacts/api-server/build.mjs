import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node","pdf-parse","mammoth","sharp","better-sqlite3","sqlite3",
      "canvas","bcrypt","argon2","fsevents","re2","farmhash","xxhash-addon",
      "bufferutil","utf-8-validate","ssh2","cpu-features","dtrace-provider",
      "isolated-vm","lightningcss","pg-native","oracledb",
      "mongodb-client-encryption","nodemailer","handlebars","knex","typeorm",
      "protobufjs","onnxruntime-node","@tensorflow/*","@prisma/client",
      "@mikro-orm/*","@grpc/*","@swc/*","@aws-sdk/*","@azure/*",
      "@opentelemetry/*","@google-cloud/*","@google/*","googleapis",
      "firebase-admin","@parcel/watcher","@sentry/profiling-node",
      "@tree-sitter/*","aws-sdk","classic-level","dd-trace","ffi-napi",
      "grpc","hiredis","kerberos","leveldown","miniflare","mysql2","newrelic",
      "odbc","piscina","realm","ref-napi","rocksdb","sass-embedded","sequelize",
      "serialport","snappy","tinypool","usb","workerd","wrangler","zeromq",
      "zeromq-prebuilt","playwright","puppeteer","puppeteer-core","electron",
    ],
    sourcemap: "linked",
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';\nimport __bannerPath from 'node:path';\nimport __bannerUrl from 'node:url';\n\nglobalThis.require = __bannerCrReq(import.meta.url);\nglobalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);\nglobalThis.__dirname = __bannerPath.dirname(globalThis.__filename);\n    `,
    },
  });

  // ── Copy frontend build into Express's public folder ──────────────────────
  // Vite builds the React app to: artifacts/everydayai/dist/public/
  // Express serves static files from: artifacts/api-server/dist/../public/
  //                                  = artifacts/api-server/public/
  // We copy after every build so Railway always serves the latest frontend.
  const frontendSrc  = path.resolve(artifactDir, "../everydayai/dist/public");
  const frontendDest = path.resolve(artifactDir, "dist/../public");

  if (existsSync(frontendSrc)) {
    console.log("Copying frontend build into Express public folder...");
    await cp(frontendSrc, frontendDest, { recursive: true });
    console.log("Frontend files copied successfully.");
  } else {
    console.warn(
      "WARNING: Frontend build not found at", frontendSrc,
      "— white screen will occur. Make sure everydayai builds before api-server."
    );
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
