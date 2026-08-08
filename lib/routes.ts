// Every URL the app can navigate to, in one file.
//
// No 'use client' here on purpose: server components need these too, and a module
// marked as client can't have its functions *called* from the server, only rendered.
//
//   /                         discover — published novels and what the app is
//   /library                  the reader's own shelf (?tab=favorites|bookmarks|history)
//   /novel?id=<id>            a local novel's page
//   /read?novel=<id>&chapter=<slug>   the local reader
//   /write?novel=<id>&chapter=<slug>  the chapter editor (chapter=new for a fresh one)
//   /n/<slug>                 a published novel's page
//   /n/<slug>/<chapter>       the published reader
//   /publish                  add a novel
//
// Local routes carry their target in the query string rather than the path: a static
// export prerenders only the routes known at build time, and a folder imported next
// Tuesday is not one of them. Query params keep deep links and refresh working anyway.

/** Published novels are namespaced so a local folder called "n" can never collide. */
export const remoteId = (slug: string) => `n:${slug}`;
export const isRemoteId = (id: string) => id.startsWith('n:');

export const HOME = '/';
export const LIBRARY = '/library';
export const PUBLISH = '/publish';

export const libraryTabHref = (tab: string) => (tab === 'all' ? LIBRARY : `${LIBRARY}?tab=${tab}`);
export const localNovelHref = (id: string) => `/novel?id=${encodeURIComponent(id)}`;
export const localChapterHref = (id: string, chapter: string) =>
  `/read?novel=${encodeURIComponent(id)}&chapter=${encodeURIComponent(chapter)}`;
/** The editor is one screen. "new" is a chapter that has no slug yet, not a second route. */
export const NEW_CHAPTER = 'new';
export const chapterEditHref = (id: string, chapter: string) =>
  `/write?novel=${encodeURIComponent(id)}&chapter=${encodeURIComponent(chapter)}`;
export const chapterNewHref = (id: string) => chapterEditHref(id, NEW_CHAPTER);

export const publishedNovelHref = (slug: string) => `/n/${slug}`;
export const publishedChapterHref = (slug: string, chapter: string) => `/n/${slug}/${chapter}`;
