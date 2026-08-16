import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function requireFile(relativePath) {
  await access(path.join(repositoryRoot, relativePath));
}

async function readTextFiles(relativeDirectory) {
  const entries = await readdir(path.join(repositoryRoot, relativeDirectory), {
    withFileTypes: true,
  });
  const contents = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      contents.push(...(await readTextFiles(relativePath)));
      continue;
    }

    if (/\.(?:css|html|js)$/.test(entry.name)) {
      contents.push(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
    }
  }

  return contents;
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

const [backofficeText, posText] = await Promise.all([
  readTextFiles("apps/backoffice/dist"),
  readTextFiles("apps/pos/dist"),
]);

for (const [appName, output] of [
  ["Back Office", backofficeText],
  ["POS", posText],
]) {
  if (!output.some((contents) => contents.includes("--ks-color-bg-canvas"))) {
    throw new Error(`${appName} output does not contain the shared UI token baseline.`);
  }
}

if (
  backofficeText.some(
    (contents) =>
      contents.includes("KASTUR_UI_SHOWCASE_DEV_ONLY") ||
      contents.includes("ui-showcase"),
  )
) {
  throw new Error("The development-only UI showcase leaked into production output.");
}

console.log(
  "Verified independent app outputs, shared UI tokens, and showcase exclusion.",
);
