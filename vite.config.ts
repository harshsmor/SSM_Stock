import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'SSM Stock',
        short_name: 'SSM Stock',
        description: 'SSM Stock Management Application',
        theme_color: '#000000',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'logo.png', // Using logo.png as 512px icon
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
