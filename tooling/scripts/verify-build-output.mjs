import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function requireFile(relativePath) {
  await access(path.join(repositoryRoot, relativePath));
}

await Promise.all([
  requireFile("apps/api/dist/worker.js"),
  requireFile("apps/backoffice/dist/index.html"),
  requireFile("apps/pos/dist/index.html"),
  requireFile("apps/pos/dist/manifest.webmanifest"),
  requireFile("apps/pos/dist/sw.js"),
]);

const backofficeOutput = new Set(
  await readdir(path.join(repositoryRoot, "apps/backoffice/dist")),
);

for (const posOnlyArtifact of ["manifest.webmanifest", "sw.js"]) {
  if (backofficeOutput.has(posOnlyArtifact)) {
    throw new Error(
      `Back Office output must not contain POS-only artifact: ${posOnlyArtifact}`,
    );
  }
}

console.log(
  "Verified independent Back Office, POS/PWA, and API build outputs.",
);
