-- Run only on a restored copy first, then against the target after a verified backup.
-- The original Lovable versions differ by seconds from identical local SQL files.
-- This repairs history only; it does not apply any application migration.
-- If an assertion fails, issue ROLLBACK in the same SQL session before retrying.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- Keep the verified 29-row snapshot stable until every version is remapped.
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE lovable_migration_version_map (
  old_version text PRIMARY KEY,
  new_version text NOT NULL UNIQUE,
  expected_md5 text NOT NULL
) ON COMMIT DROP;

INSERT INTO lovable_migration_version_map (old_version, new_version, expected_md5)
VALUES
  ('20260610113735', '20260610113737', '787884b5891b2a4f19f0ea49b811d4f4'),
  ('20260610113751', '20260610113752', 'c415c6c7b3fc1b9464ce5ed109ca959f'),
  ('20260610122721', '20260610122722', 'e20f0e8b274f743296fa069303baadee'),
  ('20260610130317', '20260610130318', '8fabe1b7f8c64051b3579c99ab89194f'),
  ('20260610132930', '20260610132931', 'f565767e0ed95e07845af5ecd9570e0d'),
  ('20260610142013', '20260610142014', '9520a8fa4f74f6478cdfa6a9cd1e1cfd'),
  ('20260610151117', '20260610151118', '852499ede4923673f7cd0ee7763e827d'),
  ('20260610151950', '20260610151951', '3816403ed858de460e299f1ba7530756'),
  ('20260610152847', '20260610152848', '4475fb88463fb97e6990691c677c4153'),
  ('20260610212852', '20260610212853', '27aff2624366d95cafdf7dfb0a949c07'),
  ('20260611194712', '20260611194713', '3838de89b54414787b6eb63416ca3e50'),
  ('20260612212301', '20260612212303', '7a408764b1a1a70558ffed3945aa18d8'),
  ('20260615210350', '20260615210351', '7eb5fcc65dee2b0b46f1f0f3132b9eaf'),
  ('20260616083503', '20260616083506', '7d45baa5fe97517b2e95685fda17b60c'),
  ('20260617110125', '20260617110126', '176d9420db1b3c60ee976281f5af9f32'),
  ('20260617110329', '20260617110330', 'eabb721294d3ac2d70e0fdf0c19bb4ed'),
  ('20260617110356', '20260617110357', '127969a87fa34f44c004db5013d686f2'),
  ('20260617110411', '20260617110413', 'ef4a601ba8e07a08b6de973b809fe023'),
  ('20260617114315', '20260617114317', '0ad85419a25b8a62684181ddb2ceaa34'),
  ('20260617120857', '20260617120859', '9df3ff397344a03a77fe78941746d002'),
  ('20260617121535', '20260617121537', '5df2f77f4b350a1e18927a46de4c40ab'),
  ('20260617155547', '20260617155549', 'b467add7b75a8d99b2e42a531d688437'),
  ('20260617160125', '20260617160127', '8d3c3a23aa00ac10c2f129f53395281f'),
  ('20260618080854', '20260618080855', 'bc45a11a6d900b64ceb678951fc0827e'),
  ('20260618094047', '20260618094049', 'aae3e93cf611439eb3bc992c1a9a0079'),
  ('20260618122539', '20260618122540', '7914b562081c11a1c8713da059040697'),
  ('20260619094839', '20260619094841', 'e04e37a4175e2a0556ea7e1c79f60b80'),
  ('20260619104330', '20260619104331', '3e5cc7660443f3b8a805ec208740b6b6'),
  ('20260622145643', '20260622145645', 'f9f16e1b7ce6847c25a06edc3385c935');

DO $$
DECLARE
  matched integer;
  updated integer;
BEGIN
  SELECT count(*) INTO matched
  FROM supabase_migrations.schema_migrations s
  JOIN lovable_migration_version_map m ON m.old_version = s.version
  WHERE md5(array_to_string(s.statements, E'\n')) = m.expected_md5;

  IF matched <> 29
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 29
     OR EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations s
       JOIN lovable_migration_version_map m ON m.new_version = s.version
     ) THEN
    RAISE EXCEPTION 'Lovable migration history differs from the verified 29-file snapshot';
  END IF;

  UPDATE supabase_migrations.schema_migrations s
  SET version = m.new_version
  FROM lovable_migration_version_map m
  WHERE s.version = m.old_version;

  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 29 OR (
    SELECT count(*) FROM supabase_migrations.schema_migrations s
    JOIN lovable_migration_version_map m ON m.new_version = s.version
  ) <> 29 THEN
    RAISE EXCEPTION 'Migration history reconciliation did not update all 29 versions';
  END IF;
END;
$$;

COMMIT;
