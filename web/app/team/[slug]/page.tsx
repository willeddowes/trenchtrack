import { redirect } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/teamsStatic";

// Links that omit a season (e.g. from the homepage) land here and get sent
// to the current season's page. No data fetching here -- if the slug is
// bad, the target page's own getTeamPageData() -> notFound() handles it.
export default async function TeamRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/team/${slug}/${CURRENT_SEASON}`);
}
