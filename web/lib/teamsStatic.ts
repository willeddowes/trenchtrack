// Hardcoded rather than queried from Supabase at build time, so a build
// never breaks on a database hiccup -- the list of NFL teams and which
// seasons we support essentially never changes week to week.

export const CURRENT_SEASON = 2025;
export const SUPPORTED_SEASONS = [2021, 2022, 2023, 2024, 2025, 2026];

// Slug + display name for each team, so the header search box works
// without a database round-trip on every single page load.
export const TEAMS = [
  { slug: "bills", name: "Buffalo Bills" },
  { slug: "dolphins", name: "Miami Dolphins" },
  { slug: "patriots", name: "New England Patriots" },
  { slug: "jets", name: "New York Jets" },
  { slug: "ravens", name: "Baltimore Ravens" },
  { slug: "bengals", name: "Cincinnati Bengals" },
  { slug: "browns", name: "Cleveland Browns" },
  { slug: "steelers", name: "Pittsburgh Steelers" },
  { slug: "texans", name: "Houston Texans" },
  { slug: "colts", name: "Indianapolis Colts" },
  { slug: "jaguars", name: "Jacksonville Jaguars" },
  { slug: "titans", name: "Tennessee Titans" },
  { slug: "broncos", name: "Denver Broncos" },
  { slug: "chiefs", name: "Kansas City Chiefs" },
  { slug: "raiders", name: "Las Vegas Raiders" },
  { slug: "chargers", name: "Los Angeles Chargers" },
  { slug: "cowboys", name: "Dallas Cowboys" },
  { slug: "giants", name: "New York Giants" },
  { slug: "eagles", name: "Philadelphia Eagles" },
  { slug: "commanders", name: "Washington Commanders" },
  { slug: "bears", name: "Chicago Bears" },
  { slug: "lions", name: "Detroit Lions" },
  { slug: "packers", name: "Green Bay Packers" },
  { slug: "vikings", name: "Minnesota Vikings" },
  { slug: "falcons", name: "Atlanta Falcons" },
  { slug: "panthers", name: "Carolina Panthers" },
  { slug: "saints", name: "New Orleans Saints" },
  { slug: "buccaneers", name: "Tampa Bay Buccaneers" },
  { slug: "cardinals", name: "Arizona Cardinals" },
  { slug: "rams", name: "Los Angeles Rams" },
  { slug: "49ers", name: "San Francisco 49ers" },
  { slug: "seahawks", name: "Seattle Seahawks" },
];

export const TEAM_SLUGS = TEAMS.map((t) => t.slug);
