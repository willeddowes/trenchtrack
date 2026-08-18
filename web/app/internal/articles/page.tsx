import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ArticleForm } from "./ArticleForm";

// Protected by proxy.ts's /internal/:path* cookie check.
export const dynamic = "force-dynamic"; // always show the latest articles, never cache this page

export default async function ArticlesAdminPage() {
  // Service-role client (not the anon one other admin pages use) so drafts
  // show up here too -- the public RLS policy only allows published rows.
  const supabase = createServiceRoleClient();
  const { data: articles } = await supabase
    .from("articles")
    .select("slug, title, published, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold">Articles</h1>
        <p className="mt-1 text-sm text-gray-600">
          Write and publish articles. Saves immediately on submit.
        </p>
      </div>

      <ArticleForm />

      <div className="space-y-2 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Existing articles</h2>
        {!articles || articles.length === 0 ? (
          <p className="text-sm text-gray-600">No articles yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {articles.map((a) => (
              <li key={a.slug} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">{a.title}</span>{" "}
                  <span className="text-gray-500">/{a.slug}</span>
                  {!a.published && (
                    <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">
                      draft
                    </span>
                  )}
                </div>
                {a.published && (
                  <Link href={`/articles/${a.slug}`} className="text-blue-600 hover:underline">
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
