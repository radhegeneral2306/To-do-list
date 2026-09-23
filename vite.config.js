import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` must match the GitHub repo name, because GitHub Pages serves the app at
// https://<user>.github.io/To-do-list/
export default defineConfig({
  plugins: [react()],
  base: '/To-do-list/',
})
