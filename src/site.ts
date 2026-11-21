export const site = {
  name: 'tatenda nyemudzo.dev',
  description: 'Apps, music, photographs, and thoughts from Tatenda Nyemudzo.',
};

export const sections = [
  { id: 'apps', title: 'Apps', singular: 'app', description: 'Things I make. Find out what they do and download them here.', empty: 'No apps published yet.', note: 'App descriptions and downloads will live here.' },
  { id: 'experiments', title: 'Experiments & ideas', singular: 'idea', description: 'Ideas I’m exploring, questions I’m researching, and things I’m still building.', empty: 'The first ideas are on their way.', note: 'I’ll share what I’m exploring, what I’ve tried, and what I’m figuring out next.' },
  { id: 'music', title: 'Music', singular: 'song', description: 'Songs I’m listening to, with a few words about each.', empty: 'No songs shared yet.', note: 'Listening links and notes will live here.' },
  { id: 'photography', title: 'Photography', singular: 'photo', description: 'Photographs I take and want to keep.', empty: 'No photographs shared yet.', note: 'Photographs and their stories will live here.' },
  { id: 'blog', title: 'Blog', singular: 'post', description: 'A place to share my thoughts, one post at a time.', empty: 'No posts published yet.', note: 'Thoughts and longer pieces will live here.' },
] as const;

export type SectionId = typeof sections[number]['id'];

export function href(path = '') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}

export function entryHref(section: SectionId, id: string) {
  return href(`${section}/${id.split('/').map(encodeURIComponent).join('/')}/`);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
