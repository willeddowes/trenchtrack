import { redirect } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/teamsStatic";

// Links that omit a season (e.g. from the header nav) land here and get
// sent to the current season's page.
export default function StatsRedirectPage() {
  redirect(`/stats/${CURRENT_SEASON}`);
}
