import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  preview: {
    allowedHosts: ['localhost', '127.0.0.1', 'wb', 'siig-workbox', 'workbox', 'siig-workbox.tail7dc06.ts.net'],
  },
})
