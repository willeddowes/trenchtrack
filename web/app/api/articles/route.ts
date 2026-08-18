import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Protected by proxy.ts's cookie check (see its matcher) -- unlike
// /api/espn-entry, this one actually requires the tt_admin cookie.

type ArticleBody = {
  slug: string;
  title: string;
  content_html: string;
  published: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ArticleBody;

  if (!body.slug || !body.title || !body.content_html) {
    return NextResponse.json({ error: "slug, title, and content_html are required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("articles").upsert(
    {
      slug: body.slug,
      title: body.title,
      content_html: body.content_html,
      published: body.published,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slug" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Refresh the list page and this article's own page so a publish/edit
  // shows up on next visit instead of waiting for the daily ISR window.
  revalidatePath("/articles");
  revalidatePath(`/articles/${body.slug}`);
  return NextResponse.json({ ok: true });
}
