import { getCollection, type CollectionEntry } from 'astro:content';
import type { SectionId } from '../site';

export type Entry = CollectionEntry<SectionId>;

export async function publishedEntries<T extends SectionId>(section: T) {
  const now = Date.now();
  const entries = await getCollection(section, ({ data }) => data.published && (!data.date || data.date.getTime() <= now));
  return entries.sort((a, b) => {
    const dateDifference = (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0);
    return dateDifference || a.data.title.localeCompare(b.data.title);
  });
}
