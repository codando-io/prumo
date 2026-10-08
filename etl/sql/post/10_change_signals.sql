-- Signals that depend on the snapshot diff (run after snapshotAndDiff).
-- Only the most recent pair of captures of each election is considered.

CREATE OR REPLACE TEMP TABLE last_pair AS
SELECT year, max(to_capture) AS to_capture FROM campaign_change GROUP BY year;

-- 13. Campaign totals changed significantly between the two most recent TSE publications.
INSERT INTO signal
SELECT ch.year, ch.candidate_id, 'mudanca_totais', 'mudanca',
  greatest(abs(coalesce(ch.new_revenue, 0) - coalesce(ch.old_revenue, 0)), abs(coalesce(ch.new_expense, 0) - coalesce(ch.old_expense, 0))),
  0.2, NULL, ch.to_capture, ch.from_capture,
  coalesce(ch.new_expense, 0) - coalesce(ch.old_expense, 0),
  NULL,
  greatest(
    abs(coalesce(ch.new_revenue, 0) - coalesce(ch.old_revenue, 0)) / greatest(coalesce(ch.old_revenue, 0), 1),
    abs(coalesce(ch.new_expense, 0) - coalesce(ch.old_expense, 0)) / greatest(coalesce(ch.old_expense, 0), 1))
FROM campaign_change ch JOIN last_pair lp ON lp.year = ch.year AND lp.to_capture = ch.to_capture
WHERE ch.old_revenue IS NOT NULL AND ch.new_revenue IS NOT NULL
  AND (
    (abs(ch.new_revenue - ch.old_revenue) >= 30000 AND abs(ch.new_revenue - ch.old_revenue) / greatest(ch.old_revenue, 1) >= 0.2)
    OR (abs(ch.new_expense - ch.old_expense) >= 30000 AND abs(ch.new_expense - ch.old_expense) / greatest(ch.old_expense, 1) >= 0.2)
  );

-- 14. Previously published transactions no longer appear (removed or corrected) in the latest publication.
INSERT INTO signal
SELECT l.year, l.candidate_id, 'registros_removidos', 'mudanca',
  count(*), 1, NULL, l.to_capture, l.from_capture, sum(l.old_value)::DOUBLE, count(*), count(*) / 10.0
FROM change_log l JOIN last_pair lp ON lp.year = l.year AND lp.to_capture = l.to_capture
WHERE l.change = 'removed'
GROUP BY l.year, l.candidate_id, l.to_capture, l.from_capture
HAVING count(*) >= 1;

CREATE OR REPLACE TABLE signal_count AS
SELECT year, candidate_id, count(*) AS n, list(DISTINCT code) AS codes FROM signal GROUP BY ALL;
