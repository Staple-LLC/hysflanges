import { defineConfig } from 'vite';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./dist/', import.meta.url));

export default defineConfig({
  root,
  plugins: [{
    name: 'serve-video-segments',
    configureServer(server) {
      // HLS .ts files are binary video, not TypeScript modules.
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (!pathname.startsWith('/media/') || !pathname.endsWith('.ts')) return next();
        let filename;
        try {
          filename = path.resolve(root, '.' + decodeURIComponent(pathname));
          if (!filename.startsWith(root + path.sep) && !filename.startsWith(root)) return next();
          const info = await stat(filename);
          if (!info.isFile()) return next();
          res.setHeader('Content-Type', 'video/mp2t');
          res.setHeader('Content-Length', info.size);
          if (req.method === 'HEAD') return res.end();
          const stream = createReadStream(filename);
          stream.on('error', () => res.destroy());
          stream.pipe(res);
        } catch {
          next();
        }
      });
    },
  }],
});
