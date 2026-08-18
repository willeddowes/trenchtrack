import Link from "next/link";
import { getArticlesList, excerptFromHtml } from "@/lib/getArticlesData";

export const revalidate = 86400; // matches root layout's daily ISR

export const metadata = {
  title: "Articles — TrenchTrack",
  description: "Analysis and notes on NFL offensive line play.",
};

export default async function ArticlesPage() {
  const articles = await getArticlesList();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight">Articles</h1>

      {articles.length === 0 ? (
        <p className="mt-4 text-ink-muted">No articles yet — check back soon.</p>
      ) : (
        <ul className="mt-6 space-y-6">
          {articles.map((a) => (
            <li key={a.slug} className="border-b border-line pb-6">
              <Link href={`/articles/${a.slug}`} className="text-xl font-bold hover:text-accent">
                {a.title}
              </Link>
              <p className="mt-1 text-sm text-ink-muted">
                {new Date(a.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="mt-2 text-ink-muted">{excerptFromHtml(a.content_html)}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
