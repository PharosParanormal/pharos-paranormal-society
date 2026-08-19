/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        paper: '#FFFFFF',
        cream: '#F0EAD6',
      },
      fontFamily: {
        heading: ['"Archivo Black"', '"Libre Franklin"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
