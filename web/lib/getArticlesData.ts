import { createAnonServerClient } from "@/lib/supabase/server";

export type ArticleListItem = {
  slug: string;
  title: string;
  content_html: string;
  created_at: string;
};

export type Article = ArticleListItem & {
  updated_at: string;
};

/** Published articles only -- the anon client's RLS policy already
 * enforces this, but the explicit .eq() keeps intent obvious here. */
export async function getArticlesList(): Promise<ArticleListItem[]> {
  const supabase = createAnonServerClient();
  const { data } = await supabase
    .from("articles")
    .select("slug, title, content_html, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = createAnonServerClient();
  const { data } = await supabase
    .from("articles")
    .select("slug, title, content_html, created_at, updated_at")
    .eq("slug", slug)
    .eq("published", true)
    .single();

  return data ?? null;
}

/** Strips HTML tags for a plain-text list excerpt. Good enough for
 * Tiptap's simple output (no nested/malformed markup to worry about). */
export function excerptFromHtml(html: string, maxLength = 160): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}
