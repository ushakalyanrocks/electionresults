import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path = repo name for GitHub Pages project sites.
// Change REPO_NAME if the GitHub repo is named differently.
const REPO_NAME = 'tjelectionresults-v2';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? `/${REPO_NAME}/` : '/',
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
