// Hardcoded rather than queried from Supabase at build time, so a build
// never breaks on a database hiccup -- the list of NFL teams and which
// seasons we support essentially never changes week to week.

export const CURRENT_SEASON = 2025;
export const SUPPORTED_SEASONS = [2024, 2025];

export const TEAM_SLUGS = [
  "bills", "dolphins", "patriots", "jets",
  "ravens", "bengals", "browns", "steelers",
  "texans", "colts", "jaguars", "titans",
  "broncos", "chiefs", "raiders", "chargers",
  "cowboys", "giants", "eagles", "commanders",
  "bears", "lions", "packers", "vikings",
  "falcons", "panthers", "saints", "buccaneers",
  "cardinals", "rams", "49ers", "seahawks",
];
