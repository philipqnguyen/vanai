import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, createReadStream, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { runtimeRoot } from "../scripts/runtime-root.mjs";
const gameRoot=fileURLToPath(new URL("../",import.meta.url));

// The maker's assets: one folder of files named by their content (VANAI_RUNTIME,
// the maker's tools/runtime/prepare.mjs), served at /assets/files/ by the dev and
// preview servers -- the same paths production serves under VITE_ASSET_BASE
// (DEPLOY.md). Names are hashes, so a file never changes and may be cached forever.
const TYPES: Record<string, string> = { glb: "model/gltf-binary", ktx2: "image/ktx2", json: "application/json", png: "image/png", webp: "image/webp", bin: "application/octet-stream" };
function runtimeAssets(): Plugin {
  const serve = (server: { middlewares: { use: (path: string, fn: (req: any, res: any) => void) => void } }) => {
    const root = runtimeRoot(gameRoot);
    server.middlewares.use("/assets/files", (req, res) => {
      const name = decodeURIComponent((req.url || "").replace(/^\//, "").split("?")[0]);
      const m = /^[0-9a-f]{64}\.([a-z0-9]+)$/.exec(name);
      let size = -1;
      try { if (m) size = statSync(join(root, "files", name)).size; } catch { /* missing */ }
      if (!m || size < 0) { res.statusCode = 404; res.end("Not in the runtime folder."); return; }
      res.setHeader("Content-Type", TYPES[m[1]] ?? "application/octet-stream");
      res.setHeader("Content-Length", size);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      if (req.method === "HEAD") { res.end(); return; }
      createReadStream(join(root, "files", name)).pipe(res);
    });
  };
  return { name: "vanai-runtime-assets", configureServer: serve, configurePreviewServer: serve };
}

// Dev-only sink for the ?zone annotation tool (client/src/annotate.ts). A
// browser cannot write to the repo, and the notes are worth nothing if they do
// not land somewhere Claude can read, so `npx vite` carries a POST endpoint
// that drops each batch into tmp/zone-notes/<zone>-<stamp>/:
//
//   notes.md    what to read -- shape, measurements, a reproduce URL, the text
//   notes.json  the same thing structured, including the raw stroke points
//   <n>.png     the frame each note was written against, overlay included
//
// apply: "serve" keeps it out of the production build entirely; tmp/ at the
// repo root is gitignored.
//
// Any page the developer has open can POST to localhost, so the endpoint takes
// only what annotate.ts sends: JSON (another origin cannot send that without a
// preflight Vite refuses) from this server's own origin, a zone key and
// numbered shots, which can name nothing outside tmp/zone-notes/.
const NOTES_MAX_BYTES = 64 * 1024 * 1024;
function zoneNotes(): Plugin {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const notesRoot = resolve(repoRoot, "tmp", "zone-notes");
  return {
    name: "vanai-zone-notes",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__zone-notes", (req, res, next) => {
        if (req.method !== "POST") return next();
        const refuse = (status: number, error: string) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, error }));
        };
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (!String(req.headers["content-type"] || "").startsWith("application/json")) return refuse(415, "JSON only");
        if (origin && origin !== `http://${host}` && origin !== `https://${host}`) return refuse(403, "same origin only");
        let body = "";
        let bytes = 0;
        let over = false;
        req.on("data", (c) => {
          if (over) return;
          bytes += c.length;
          if (bytes > NOTES_MAX_BYTES) {
            // answer, then drop the connection rather than read the rest
            over = true;
            res.setHeader("connection", "close");
            res.once("finish", () => req.destroy());
            refuse(413, "batch too large");
            return;
          }
          body += c;
        });
        req.on("end", () => {
          if (over) return;
          res.setHeader("content-type", "application/json");
          try {
            const p = JSON.parse(body) as {
              zone: string; markdown: string;
              shots: Record<string, string>;
            };
            if (!/^[a-z0-9_]+$/.test(String(p.zone))) return refuse(400, "bad zone key");
            const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const rel = join("tmp", "zone-notes", `${p.zone}-${stamp}`);
            const dir = join(repoRoot, rel);
            // a backstop: the key above already cannot climb out
            if (!resolve(dir).startsWith(notesRoot + sep)) return refuse(400, "bad zone key");
            mkdirSync(dir, { recursive: true });

            // screenshots go to their own files; keeping megabytes of base64
            // inside notes.json would make it unreadable
            const shots = p.shots || {};
            const ext = (d: string) => (d.startsWith("data:image/jpeg") ? "jpg" : "png");
            const shotNames: string[] = [];
            for (const [n, dataUrl] of Object.entries(shots)) {
              if (!/^\d+$/.test(n)) continue; // annotate.ts keys shots by note number
              const b64 = String(dataUrl).split(",")[1];
              if (!b64) continue;
              const name = `${n}.${ext(String(dataUrl))}`;
              writeFileSync(join(dir, name), Buffer.from(b64, "base64"));
              shotNames.push(name);
            }
            writeFileSync(join(dir, "notes.md"), p.markdown ?? "");
            writeFileSync(join(dir, "notes.json"),
              JSON.stringify({ ...p, shots: shotNames }, null, 2));

            server.config.logger.info(`zone notes → ${rel}`);
            res.end(JSON.stringify({ ok: true, dir: rel }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

// The audit server: VANAI_NO_HMR=1 serves the client with no hot reload and no
// file watching, so an audit agent can hold a dev server on its own port (and
// its pages, mid-render, stay put) while other agents edit the files under it.
// Each module is transformed once, when first asked for, and served as it was
// then until the server restarts -- what an audit wants, a fixed build to look
// at. `ws: false` too: with HMR off, the client's socket would still reload the
// page when it lost the server.
//   VANAI_NO_HMR=1 npx vite --port 5177 --strictPort
const noHmr = process.env.VANAI_NO_HMR === "1";

export default defineConfig({
  plugins: [zoneNotes(), runtimeAssets()],
  build: {
    // Emit hashed bundles into dist/client/ rather than dist/assets/. In production
    // the whole dist tree is copied into the Rails public/ directory, and public/assets
    // belongs to Propshaft — it is what `asset_path` bridges between deploys and what
    // .dockerignore excludes. Keeping the client out of it avoids both collisions.
    assetsDir: "client",
  },
  server: {
    port: 5173,
    ...(noHmr ? { hmr: false, ws: false as const, watch: null } : {}),
    fs: {
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../shared", import.meta.url)),
      ],
    },
  },
  resolve: {
    alias: {
      "@data": fileURLToPath(new URL("../shared/data", import.meta.url)),
    },
  },
});
