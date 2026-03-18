import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'e2e_testing_scan_performance';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? `/${repoName}/` : '/',
}));
