import type { TeamStatsRow } from "@/lib/getTeamStatsData";

export type ColumnKey =
  | "overall"
  | "passBlock"
  | "runBlock"
  | "sacksAllowed"
  | "pressureRate"
  | "stuffRate"
  | "yardsBeforeContact"
  | "espnPassBlockWinRate"
  | "espnRunBlockWinRate";

export type StatsColumn = {
  key: ColumnKey;
  label: string;
  higherIsBetter: boolean;
  value: (row: TeamStatsRow) => number | null;
  grade?: (row: TeamStatsRow) => string | null; // only the 3 blended-score columns have a letter grade
  format: (row: TeamStatsRow) => string;
};

/** One place that knows what each column means -- drives the table
 * headers, the sort logic, and the chart, so all three always agree. */
export const STATS_COLUMNS: StatsColumn[] = [
  {
    key: "overall",
    label: "Overall",
    higherIsBetter: true,
    value: (r) => r.overall_score,
    grade: (r) => r.overall_grade,
    format: (r) => (r.overall_score !== null ? r.overall_score.toFixed(0) : "—"),
  },
  {
    key: "passBlock",
    label: "Pass Block",
    higherIsBetter: true,
    value: (r) => r.pass_block_score,
    grade: (r) => r.pass_block_grade,
    format: (r) => (r.pass_block_score !== null ? r.pass_block_score.toFixed(0) : "—"),
  },
  {
    key: "runBlock",
    label: "Run Block",
    higherIsBetter: true,
    value: (r) => r.run_block_score,
    grade: (r) => r.run_block_grade,
    format: (r) => (r.run_block_score !== null ? r.run_block_score.toFixed(0) : "—"),
  },
  {
    key: "sacksAllowed",
    label: "Sacks Allowed",
    higherIsBetter: false,
    value: (r) => r.sacks_allowed,
    format: (r) => (r.sacks_allowed !== null ? String(r.sacks_allowed) : "—"),
  },
  {
    key: "pressureRate",
    label: "Pressure Rate",
    higherIsBetter: false,
    value: (r) => r.pressure_rate_allowed,
    format: (r) => (r.pressure_rate_allowed !== null ? `${(r.pressure_rate_allowed * 100).toFixed(1)}%` : "—"),
  },
  {
    key: "stuffRate",
    label: "Stuff Rate",
    higherIsBetter: false,
    value: (r) => r.stuff_rate,
    format: (r) => (r.stuff_rate !== null ? `${(r.stuff_rate * 100).toFixed(1)}%` : "—"),
  },
  {
    key: "yardsBeforeContact",
    label: "Yards Before Contact/Att",
    higherIsBetter: true,
    value: (r) => r.yards_before_contact_per_att,
    format: (r) => (r.yards_before_contact_per_att !== null ? r.yards_before_contact_per_att.toFixed(2) : "—"),
  },
  {
    key: "espnPassBlockWinRate",
    label: "ESPN Pass Blk Win Rate",
    higherIsBetter: true,
    value: (r) => r.espn_pass_block_win_rate,
    format: (r) => (r.espn_pass_block_win_rate !== null ? `${r.espn_pass_block_win_rate}%` : "—"),
  },
  {
    key: "espnRunBlockWinRate",
    label: "ESPN Run Blk Win Rate",
    higherIsBetter: true,
    value: (r) => r.espn_run_block_win_rate,
    format: (r) => (r.espn_run_block_win_rate !== null ? `${r.espn_run_block_win_rate}%` : "—"),
  },
];
