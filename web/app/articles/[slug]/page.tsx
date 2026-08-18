import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleBySlug } from "@/lib/getArticlesData";

export const revalidate = 86400; // matches root layout's daily ISR

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
      <Link href="/articles" className="text-sm font-bold text-ink-muted hover:text-ink">
        ← Articles
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{article.title}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {new Date(article.created_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {/* content_html only ever comes from the admin's own Tiptap editor
          (gated by the /internal cookie check), not user input, so
          rendering it directly is safe here. */}
      <div
        className="article-content mt-6"
        dangerouslySetInnerHTML={{ __html: article.content_html }}
      />
    </main>
  );
}
