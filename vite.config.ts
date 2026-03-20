import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'e2e-scan-perfomance-tool';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? `/${repoName}/` : '/',
}));
