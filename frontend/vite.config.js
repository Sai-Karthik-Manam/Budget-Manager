import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192x192.jpg', 'icon-512x512.jpg'],
      manifest: {
        name: 'WealthSense',
        short_name: 'WealthSense',
        description: 'Advanced Personal Finance & Budget Manager',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192x192.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'icon-512x512.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
