import { defineCollection, z } from 'astro:content';

const team = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    role: z.string(),
    photo: z.string().optional(),
    specialties: z.array(z.string()).optional(),
    order: z.number().default(99),
  }),
});

const testimonials = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    location: z.string().optional(),
    quote: z.string(),
    rating: z.number().min(1).max(5).optional(),
    date: z.date(),
    featured: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string(),
    coverImage: z.string().optional(),
    excerpt: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

const siteSettings = defineCollection({
  type: 'data',
  schema: z.object({
    email: z.string(),
    phone: z.string().optional(),
    address: z.string(),
    investigationRequestNote: z.string(),
    socialLinks: z.object({
      instagram: z.string().optional(),
      facebook: z.string().optional(),
      tiktok: z.string().optional(),
      youtube: z.string().optional(),
    }),
  }),
});

export const collections = {
  team,
  testimonials,
  blog,
  'site-settings': siteSettings,
};
