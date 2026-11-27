import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const CUSTOM_PACK_PREFIX = '/__custom_pack__/';
const CUSTOM_PACK_DIR = path.resolve(process.cwd(), '.krunkedbonk-assets');

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.atlas': 'text/plain; charset=utf-8',
};

/**
 * Dev-only middleware that serves local `.krunkedbonk-assets/*` at `/__custom_pack__/*`
 * strictly when the folder exists on disk. Never runs during `vite build` and never
 * copies `.krunkedbonk-assets` into `dist/`.
 */
function customPackDevMiddleware(): Plugin {
  return {
    name: 'krunkedbonk-custom-pack-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url;
        if (!rawUrl || !rawUrl.startsWith(CUSTOM_PACK_PREFIX)) {
          next();
          return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        if (!fs.existsSync(CUSTOM_PACK_DIR)) {
          res.statusCode = 404;
          res.end('Custom pack directory not found');
          return;
        }

        const pathname = rawUrl.split('?')[0] ?? '';
        let relPath: string;
        try {
          relPath = decodeURIComponent(pathname.slice(CUSTOM_PACK_PREFIX.length));
        } catch {
          res.statusCode = 400;
          res.end('Malformed path');
          return;
        }

        const resolved = path.resolve(CUSTOM_PACK_DIR, relPath);
        const normalizedRoot = CUSTOM_PACK_DIR.endsWith(path.sep)
          ? CUSTOM_PACK_DIR
          : `${CUSTOM_PACK_DIR}${path.sep}`;

        if (resolved !== CUSTOM_PACK_DIR && !resolved.startsWith(normalizedRoot)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        fs.stat(resolved, (err, stat) => {
          if (err || !stat.isFile()) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }

          const ext = path.extname(resolved).toLowerCase();
          res.statusCode = 200;
          res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
          res.setHeader('Content-Length', String(stat.size));
          res.setHeader('Cache-Control', 'no-store');

          if (req.method === 'HEAD') {
            res.end();
            return;
          }

          const stream = fs.createReadStream(resolved);
          stream.on('error', () => {
            if (!res.headersSent) {
              res.statusCode = 500;
            }
            res.end();
          });
          stream.pipe(res);
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [customPackDevMiddleware()],
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules\\three')) {
            return 'three';
          }
          return undefined;
        },
      },
    },
  },
});
