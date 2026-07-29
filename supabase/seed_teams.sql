-- Seeds the 32 NFL teams. Run this once after schema.sql, in the Supabase
-- SQL Editor. Safe to re-run -- "on conflict" means it updates existing rows
-- instead of erroring on a duplicate team_abbr.
--
-- team_abbr uses nflverse's convention (e.g. 'LA' for the Rams, not 'LAR')
-- since that's what the Python pipeline will join against.
-- logo_url points at ESPN's public logo CDN as a convenience -- double check
-- these render correctly and swap any that are wrong.

insert into teams (team_abbr, team_name, team_nickname, slug, conference, division, logo_url, primary_color, secondary_color)
values
  ('BUF', 'Buffalo Bills', 'Bills', 'bills', 'AFC', 'AFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png', '#00338D', '#C60C30'),
  ('MIA', 'Miami Dolphins', 'Dolphins', 'dolphins', 'AFC', 'AFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png', '#008E97', '#FC4C02'),
  ('NE', 'New England Patriots', 'Patriots', 'patriots', 'AFC', 'AFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png', '#002244', '#C60C30'),
  ('NYJ', 'New York Jets', 'Jets', 'jets', 'AFC', 'AFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png', '#125740', '#000000'),

  ('BAL', 'Baltimore Ravens', 'Ravens', 'ravens', 'AFC', 'AFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png', '#241773', '#000000'),
  ('CIN', 'Cincinnati Bengals', 'Bengals', 'bengals', 'AFC', 'AFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png', '#FB4F14', '#000000'),
  ('CLE', 'Cleveland Browns', 'Browns', 'browns', 'AFC', 'AFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png', '#311D00', '#FF3C00'),
  ('PIT', 'Pittsburgh Steelers', 'Steelers', 'steelers', 'AFC', 'AFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png', '#FFB612', '#101820'),

  ('HOU', 'Houston Texans', 'Texans', 'texans', 'AFC', 'AFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png', '#03202F', '#A71930'),
  ('IND', 'Indianapolis Colts', 'Colts', 'colts', 'AFC', 'AFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png', '#002C5F', '#A2AAAD'),
  ('JAX', 'Jacksonville Jaguars', 'Jaguars', 'jaguars', 'AFC', 'AFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/jax.png', '#101820', '#D7A22A'),
  ('TEN', 'Tennessee Titans', 'Titans', 'titans', 'AFC', 'AFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png', '#0C2340', '#4B92DB'),

  ('DEN', 'Denver Broncos', 'Broncos', 'broncos', 'AFC', 'AFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png', '#FB4F14', '#002244'),
  ('KC', 'Kansas City Chiefs', 'Chiefs', 'chiefs', 'AFC', 'AFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png', '#E31837', '#FFB81C'),
  ('LV', 'Las Vegas Raiders', 'Raiders', 'raiders', 'AFC', 'AFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png', '#000000', '#A5ACAF'),
  ('LAC', 'Los Angeles Chargers', 'Chargers', 'chargers', 'AFC', 'AFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png', '#0080C6', '#FFC20E'),

  ('DAL', 'Dallas Cowboys', 'Cowboys', 'cowboys', 'NFC', 'NFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png', '#041E42', '#869397'),
  ('NYG', 'New York Giants', 'Giants', 'giants', 'NFC', 'NFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png', '#0B2265', '#A71930'),
  ('PHI', 'Philadelphia Eagles', 'Eagles', 'eagles', 'NFC', 'NFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png', '#004C54', '#A5ACAF'),
  ('WAS', 'Washington Commanders', 'Commanders', 'commanders', 'NFC', 'NFC East', 'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png', '#5A1414', '#FFB612'),

  ('CHI', 'Chicago Bears', 'Bears', 'bears', 'NFC', 'NFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png', '#0B162A', '#C83803'),
  ('DET', 'Detroit Lions', 'Lions', 'lions', 'NFC', 'NFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png', '#0076B6', '#B0B7BC'),
  ('GB', 'Green Bay Packers', 'Packers', 'packers', 'NFC', 'NFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png', '#203731', '#FFB612'),
  ('MIN', 'Minnesota Vikings', 'Vikings', 'vikings', 'NFC', 'NFC North', 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png', '#4F2683', '#FFC62F'),

  ('ATL', 'Atlanta Falcons', 'Falcons', 'falcons', 'NFC', 'NFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png', '#A71930', '#000000'),
  ('CAR', 'Carolina Panthers', 'Panthers', 'panthers', 'NFC', 'NFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png', '#0085CA', '#101820'),
  ('NO', 'New Orleans Saints', 'Saints', 'saints', 'NFC', 'NFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png', '#D3BC8D', '#101820'),
  ('TB', 'Tampa Bay Buccaneers', 'Buccaneers', 'buccaneers', 'NFC', 'NFC South', 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png', '#D50A0A', '#34302B'),

  ('ARI', 'Arizona Cardinals', 'Cardinals', 'cardinals', 'NFC', 'NFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png', '#97233F', '#000000'),
  ('LA', 'Los Angeles Rams', 'Rams', 'rams', 'NFC', 'NFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png', '#003594', '#FFA300'),
  ('SF', 'San Francisco 49ers', '49ers', '49ers', 'NFC', 'NFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png', '#AA0000', '#B3995D'),
  ('SEA', 'Seattle Seahawks', 'Seahawks', 'seahawks', 'NFC', 'NFC West', 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png', '#002244', '#69BE28')
on conflict (team_abbr) do update set
  team_name = excluded.team_name,
  team_nickname = excluded.team_nickname,
  slug = excluded.slug,
  conference = excluded.conference,
  division = excluded.division,
  logo_url = excluded.logo_url,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color;
