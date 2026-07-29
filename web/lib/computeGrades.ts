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
 * blended into Pass Block (weighted 20/40/40: sack rate / pressure rate /
 * ESPN PBWR) / Run Block (equal-weighted) / Overall scores -- each of
 * which then gets a SECOND min-max stretch across all teams (otherwise
 * averaging multiple components means almost nobody ever hits a true 0
 * or 100, so A+/F sit empty) -- before being mapped to letters on an
 * equal-width 13-band scale.
 */

export const GRADE_FORMULA_VERSION = "v3";

// Pass Block component weights -- pressure rate and ESPN's win rate count
// double a raw sack (sacks are partly a QB-behavior/scheme stat, not
// purely an O-line one). These are relative proportions, not required to
// sum to 1 -- see weightedAverage.
const SACK_RATE_WEIGHT = 0.2;
const PRESSURE_RATE_WEIGHT = 0.4;
const ESPN_PBWR_WEIGHT = 0.4;

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

/** Weighted average of whichever components are non-null for each team. A
 * missing component (e.g. ESPN data not entered yet) drops its weight out
 * of the denominator entirely, so the remaining components' *relative*
 * weights are preserved rather than the gap being silently averaged away
 * unweighted. Pass a weight of 1 for every component to get a plain
 * average. */
function weightedAverage(components: [(number | null)[], number][]): (number | null)[] {
  const count = components[0]?.[0].length ?? 0;
  const result: (number | null)[] = [];
  for (let i = 0; i < count; i++) {
    let weightedSum = 0;
    let weightSum = 0;
    for (const [values, weight] of components) {
      const v = values[i];
      if (v !== null) {
        weightedSum += v * weight;
        weightSum += weight;
      }
    }
    result.push(weightSum > 0 ? weightedSum / weightSum : null);
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

  const normalizedPbwr = pbwr.every((v) => v === null) ? rawStats.map(() => null) : normalize(pbwr, true);
  const normalizedRbwr = rbwr.every((v) => v === null) ? rawStats.map(() => null) : normalize(rbwr, true);

  const rawPassScores = weightedAverage([
    [normalize(sackRates, false), SACK_RATE_WEIGHT],
    [normalize(pressureRates, false), PRESSURE_RATE_WEIGHT],
    [normalizedPbwr, ESPN_PBWR_WEIGHT],
  ]);
  // Run Block stays equal-weighted for now -- passing 1 for every weight
  // makes weightedAverage behave as a plain average.
  const rawRunScores = weightedAverage([
    [normalize(stuffRates, false), 1],
    [normalize(ybcPerAtt, true), 1],
    [normalizedRbwr, 1],
  ]);

  // Stretch each blended score to span the full 0-100 range across all
  // teams passed in -- see the module docstring for why (otherwise
  // almost nobody ever hits a true A+ or F).
  const passScores = normalize(rawPassScores, true);
  const runScores = normalize(rawRunScores, true);
  const rawOverallScores = rawStats.map((_, i) =>
    passScores[i] !== null && runScores[i] !== null ? (passScores[i]! + runScores[i]!) / 2 : null
  );
  const overallScores = normalize(rawOverallScores, true);

  return rawStats.map((team, i) => {
    const pass_block_score = passScores[i];
    const run_block_score = runScores[i];
    const overall_score = overallScores[i];

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
