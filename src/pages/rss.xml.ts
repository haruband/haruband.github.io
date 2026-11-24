import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, postUrl } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: 'CodeBook',
    description: "Haruband's TechBlog",
    site: context.site!,
    items: posts.map((p) => ({ title: p.data.title, pubDate: p.data.date, link: postUrl(p), categories: p.data.tags })),
  });
}
