/**
 * TypeScript port of pipeline/compute_grades.py's grading formula, used
 * only by the "Recompute grades now" button (app/api/recompute-grades).
 * The full pipeline run still does this in Python -- this is a deliberate
 * duplication so the button doesn't need a mixed Node+Python deployment.
 *
 * KEEP THIS IN SYNC WITH pipeline/compute_grades.py -- if the formula,
 * bands, or weighting ever change there, mirror the change here too.
 *
 * See compute_grades.py's docstring for the full plain-language writeup of
 * how the formula works. Short version: every raw stat is min-max scaled
 * to 0-100 across whichever teams are passed in (best=100, worst=0), then
 * averaged into Pass Block / Run Block / Overall scores and mapped to
 * letters on an equal-width 13-band scale.
 */

export const GRADE_FORMULA_VERSION = "v1";

const GRADE_BANDS: [number, string][] = [
  [92.3, "A+"], [84.6, "A"], [76.9, "A-"],
  [69.2, "B+"], [61.5, "B"], [53.8, "B-"],
  [46.2, "C+"], [38.5, "C"], [30.8, "C-"],
  [23.1, "D+"], [15.4, "D"], [7.7, "D-"],
  [0, "F"],
];

export function scoreToLetter(score: number | null): string | null {
  if (score === null) return null;
  for (const [threshold, letter] of GRADE_BANDS) {
    if (score >= threshold) return letter;
  }
  return "F";
}

/** Min-max scales a column of values (one per team) to 0-100. Ties or an
 * all-null column give everyone a neutral 50 rather than dividing by 0. */
function normalize(values: (number | null)[], higherIsBetter: boolean): (number | null)[] {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return values.map(() => null);

  const lo = Math.min(...present);
  const hi = Math.max(...present);
  if (lo === hi) return values.map((v) => (v === null ? null : 50));

  return values.map((v) => {
    if (v === null) return null;
    const scaled = ((v - lo) / (hi - lo)) * 100;
    return higherIsBetter ? scaled : 100 - scaled;
  });
}

/** Averages whichever components are non-null for each team, ignoring the
 * rest -- a missing ESPN figure just drops out of the blend. */
function rowAverage(components: (number | null)[][]): (number | null)[] {
  const count = components[0]?.length ?? 0;
  const result: (number | null)[] = [];
  for (let i = 0; i < count; i++) {
    const present = components.map((c) => c[i]).filter((v): v is number => v !== null);
    result.push(present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null);
  }
  return result;
}

export type TeamRawStats = {
  team_abbr: string;
  sacks_allowed: number;
  dropbacks: number;
  pressure_rate_allowed: number | null;
  stuff_rate: number | null;
  yards_before_contact_per_att: number | null;
};

export type EspnTeamRate = {
  team_abbr: string;
  pass_block_win_rate: number | null;
  run_block_win_rate: number | null;
};

export type GradedTeam = {
  team_abbr: string;
  pass_block_score: number | null;
  pass_block_grade: string | null;
  run_block_score: number | null;
  run_block_grade: string | null;
  overall_score: number | null;
  overall_grade: string | null;
  grade_formula_version: string;
};

/** Takes every team's latest raw stats for a season (one row per team) plus
 * whatever ESPN rates have been entered, and returns the three grades per
 * team -- comparing each team against all the others passed in. */
export function computeGrades(rawStats: TeamRawStats[], espnRates: EspnTeamRate[]): GradedTeam[] {
  const espnByTeam = new Map(espnRates.map((r) => [r.team_abbr, r]));

  const sackRates = rawStats.map((t) => (t.dropbacks > 0 ? t.sacks_allowed / t.dropbacks : null));
  const pressureRates = rawStats.map((t) => t.pressure_rate_allowed);
  const stuffRates = rawStats.map((t) => t.stuff_rate);
  const ybcPerAtt = rawStats.map((t) => t.yards_before_contact_per_att);
  const pbwr = rawStats.map((t) => espnByTeam.get(t.team_abbr)?.pass_block_win_rate ?? null);
  const rbwr = rawStats.map((t) => espnByTeam.get(t.team_abbr)?.run_block_win_rate ?? null);

  const passComponents = [
    normalize(sackRates, false),
    normalize(pressureRates, false),
    pbwr.every((v) => v === null) ? rawStats.map(() => null) : normalize(pbwr, true),
  ];
  const runComponents = [
    normalize(stuffRates, false),
    normalize(ybcPerAtt, true),
    rbwr.every((v) => v === null) ? rawStats.map(() => null) : normalize(rbwr, true),
  ];

  const passScores = rowAverage(passComponents);
  const runScores = rowAverage(runComponents);

  return rawStats.map((team, i) => {
    const pass_block_score = passScores[i];
    const run_block_score = runScores[i];
    const overall_score =
      pass_block_score !== null && run_block_score !== null
        ? (pass_block_score + run_block_score) / 2
        : null;

    return {
      team_abbr: team.team_abbr,
      pass_block_score,
      pass_block_grade: scoreToLetter(pass_block_score),
      run_block_score,
      run_block_grade: scoreToLetter(run_block_score),
      overall_score,
      overall_grade: scoreToLetter(overall_score),
      grade_formula_version: GRADE_FORMULA_VERSION,
    };
  });
}
