import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { experimentStageIds } from './lib/experiments';

const httpsUrl = z.url({ protocol: /^https$/ });
const common = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  published: z.boolean().default(false),
  date: z.coerce.date().optional(),
};
const load = (folder: string) => glob({ pattern: '**/*.md', base: `./src/content/${folder}` });

const apps = defineCollection({
  loader: load('apps'),
  schema: ({ image }) => z.object({
    ...common,
    version: z.string().optional(),
    platform: z.string().optional(),
    logo: z.object({ image: image(), alt: z.string().trim().min(1) }).optional(),
    downloads: z.array(z.object({ label: z.string().trim().min(1), url: httpsUrl })).min(1),
  }),
});

const music = defineCollection({
  loader: load('music'),
  schema: z.object({ ...common, artist: z.string().trim().min(1), listenUrl: httpsUrl }),
});

const photography = defineCollection({
  loader: load('photography'),
  schema: ({ image }) => z.object({
    ...common,
    image: image(),
    alt: z.string().trim().min(1),
    caption: z.string().optional(),
  }),
});

const blog = defineCollection({
  loader: load('blog'),
  schema: ({ image }) => z.object({
    ...common,
    date: z.coerce.date(),
    plainText: z.string().max(20000).optional(),
    photos: z.array(z.object({ image: image(), alt: z.string().trim().min(1).max(400) })).max(8).default([]),
  }),
});

const experiments = defineCollection({
  loader: load('experiments'),
  schema: ({ image }) => z.object({
    ...common,
    stage: z.enum(experimentStageIds),
    repositoryUrl: httpsUrl.optional(),
    demoUrl: httpsUrl.optional(),
    visual: z.object({ image: image(), alt: z.string().trim().min(1) }).optional(),
  }),
});

export const collections = { apps, music, photography, blog, experiments };
