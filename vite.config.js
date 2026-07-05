import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path = repo name for GitHub Pages project sites.
// Change REPO_NAME if the GitHub repo is named differently.
const REPO_NAME = 'electionresults';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? `/${REPO_NAME}/` : '/',
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
