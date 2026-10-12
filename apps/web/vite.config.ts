import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  // Le `.env` est à la racine du dépôt, partagé avec l'API (ADR-013). Seules les variables
  // préfixées VITE_ sont visibles du navigateur.
  envDir: '../..',
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    // L'API n'autorise que cette origine (WEB_ORIGIN) : pas de repli sur un autre port.
    strictPort: true,
  },
})
