/**
 * La frontera del plan, hecha revisable.
 *
 * Los mensajes de canal de Buzz se guardan **en claro** en el Postgres del
 * relay, que administra Block y no nosotros. Los datos del ERP —clientes,
 * importes, datos fiscales— viajan exclusivamente por la API de Pimia. La regla
 * en el código es una sola línea:
 *
 *   ningún módulo bajo `src/features/pimia/` importa nada de
 *   `src/shared/api/relay*`
 *
 * Una regla que nadie comprueba deja de ser una regla el día que alguien
 * necesita «solo un dato» del relay. Este guard corre en `pnpm check`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const FEATURE_ROOT = path.join(projectRoot, "src", "features", "pimia");
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);

/**
 * Lo prohibido es el carril del relay, no cualquier cosa con «relay» en el
 * nombre: `shared/api/relay*` y el propio cliente de WebSocket.
 */
const FORBIDDEN = [
  {
    pattern: /from\s+["']@\/shared\/api\/relay[^"']*["']/,
    reason: "el carril del relay (shared/api/relay*)",
  },
  {
    pattern: /from\s+["'][./]+shared\/api\/relay[^"']*["']/,
    reason: "el carril del relay (shared/api/relay*)",
  },
  {
    pattern: /from\s+["']@\/shared\/api\/tauri["']/,
    reason:
      "shared/api/tauri.ts, que a su vez importa del relay — usa @tauri-apps/api/core directamente",
  },
];

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

const violations = [];

for await (const file of walk(FEATURE_ROOT)) {
  const content = await fs.readFile(file, "utf8");
  const lines = content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const { pattern, reason } of FORBIDDEN) {
      if (pattern.test(line)) {
        violations.push({
          file: path.relative(projectRoot, file),
          line: index + 1,
          reason,
          source: line.trim(),
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    "Frontera del ERP rota: features/pimia/ no puede importar del relay.",
  );
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} importa ${violation.reason}\n    ${violation.source}`,
    );
  }
  console.error(
    "\nEl relay guarda los mensajes en claro en un Postgres que no administramos.\n" +
      "Los datos del ERP van por la API de Pimia (features/pimia/api/pimiaClient.ts).\n" +
      "Ver docs/UPSTREAM.md § La frontera innegociable.",
  );
  process.exitCode = 1;
}
