import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://pharosparanormal.com',
  integrations: [tailwind()],
});
