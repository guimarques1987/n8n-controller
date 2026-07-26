import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    ssr: path.resolve(__dirname, 'server.ts'),
    outDir: 'dist-server',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'server.ts'),
      output: {
        format: 'cjs',
        entryFileNames: 'server-js-dist.cjs',
      },
      external: [
        'pg-native',
      ],
    },
    minify: false,
  },
  ssr: {
    noExternal: true,
  }
});

