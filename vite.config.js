import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        marketplace: resolve(__dirname, 'index.html'),
        board: resolve(__dirname, 'marketplace/index.html'),
        login: resolve(__dirname, 'login/index.html'),
        listing: resolve(__dirname, 'listing/index.html'),
        sell: resolve(__dirname, 'sell/index.html'),
        chats: resolve(__dirname, 'chats/index.html'),
        profile: resolve(__dirname, 'profile/index.html'),
        user: resolve(__dirname, 'user/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        terms: resolve(__dirname, 'terms/index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        acceptableUse: resolve(__dirname, 'acceptable-use/index.html'),
      },
    },
  },
})
