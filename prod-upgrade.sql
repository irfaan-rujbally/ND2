-- ---------------------------------------------------------------------------
-- ND2 : mise a niveau du schema de production
--
-- Applique exactement ce que feraient les migrations Laravel, sans PHP.
-- A executer avec le client mysql, sur la base de production :
--
--     mysqldump -u USER -p ND > backup-avant-upgrade.sql
--     mysql -u USER -p ND < prod-upgrade.sql
--
-- Ne touche a aucune donnee existante, a une exception voulue : les lignes de
-- presence en doublon sont archivees (deleted_at renseigne), pas supprimees.
--
-- Le script est idempotent : le relancer ne casse rien.
-- ---------------------------------------------------------------------------

START TRANSACTION;

-- 1. Colonnes du formulaire d'adhesion -------------------------------------
--    Toutes nullables ou avec valeur par defaut : les membres existants
--    restent valides tels quels.

ALTER TABLE `members`
  ADD COLUMN `date_of_birth`             date         NULL AFTER `age`,
  ADD COLUMN `national_id`               varchar(255) NULL AFTER `date_of_birth`,
  ADD COLUMN `gender`                    varchar(20)  NULL AFTER `national_id`,
  ADD COLUMN `alternative_contact`       varchar(255) NULL AFTER `phone`,
  ADD COLUMN `whatsapp_available`        tinyint(1)   NOT NULL DEFAULT 0 AFTER `alternative_contact`,
  ADD COLUMN `profession`                varchar(255) NULL AFTER `address`,
  ADD COLUMN `employer_name`             varchar(255) NULL AFTER `profession`,
  ADD COLUMN `skills_expertise`          text         NULL AFTER `employer_name`,
  ADD COLUMN `communication_preferences` json         NULL AFTER `skills_expertise`,
  ADD COLUMN `volunteer_interests`       json         NULL AFTER `communication_preferences`,
  ADD COLUMN `referrer_name`             varchar(255) NULL AFTER `volunteer_interests`,
  ADD COLUMN `referrer_contact`          varchar(255) NULL AFTER `referrer_name`,
  ADD COLUMN `how_heard_about_us`        varchar(50)  NULL AFTER `referrer_contact`,
  ADD COLUMN `cv_path`                   varchar(255) NULL AFTER `how_heard_about_us`,
  ADD COLUMN `documents_path`            varchar(255) NULL AFTER `cv_path`,
  ADD COLUMN `documents_confirmed`       tinyint(1)   NOT NULL DEFAULT 0 AFTER `documents_path`;

-- 2. Archivage des presences en doublon ------------------------------------
--    Le pivot n'a jamais eu de garde-fou d'unicite : un membre pouvait etre
--    inscrit plusieurs fois a la meme reunion, ce qui gonflait les taux de
--    presence. On garde le plus petit id de chaque paire et on archive le reste.

UPDATE `meeting_has_member` AS m
  JOIN (
    SELECT MIN(`id`) AS keep_id, `meeting_id`, `member_id`
    FROM `meeting_has_member`
    WHERE `deleted_at` IS NULL
    GROUP BY `meeting_id`, `member_id`
  ) AS k
    ON m.`meeting_id` = k.`meeting_id`
   AND m.`member_id`  = k.`member_id`
SET m.`deleted_at` = NOW(),
    m.`updated_at` = NOW()
WHERE m.`deleted_at` IS NULL
  AND m.`id` <> k.keep_id;

-- 3. Enregistrement des migrations -----------------------------------------
--    Sans ces lignes, un futur `php artisan migrate` retenterait de creer des
--    tables deja presentes. Les cinq migrations 2025_01_10_* ne font que
--    decrire un schema qui existait deja avant d'etre versionne.

INSERT INTO `migrations` (`migration`, `batch`)
SELECT v.`migration`, (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`)
FROM (
  SELECT '2025_01_10_000001_create_offices_table'                            AS `migration`
  UNION ALL SELECT '2025_01_10_000002_create_members_table'
  UNION ALL SELECT '2025_01_10_000003_create_meetings_table'
  UNION ALL SELECT '2025_01_10_000004_create_meeting_has_member_table'
  UNION ALL SELECT '2025_01_10_000005_add_office_id_to_users_table'
  UNION ALL SELECT '2026_08_18_120000_soft_delete_duplicate_meeting_members'
  UNION ALL SELECT '2026_08_18_130000_add_membership_application_fields_to_members_table'
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM `migrations` AS x WHERE x.`migration` = v.`migration`
);

COMMIT;

-- 4. Controles --------------------------------------------------------------

SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'members')            AS colonnes_members_attendu_32,
  (SELECT COUNT(*) FROM `members`)                                          AS membres,
  (SELECT COUNT(*) FROM `meetings`)                                         AS reunions,
  (SELECT COUNT(*) FROM `meeting_has_member` WHERE `deleted_at` IS NULL)    AS presences_actives,
  (SELECT COUNT(*) FROM `meeting_has_member` WHERE `deleted_at` IS NOT NULL) AS presences_archivees,
  (SELECT COUNT(*) FROM `migrations`)                                       AS migrations_enregistrees;

-- Doit renvoyer 0 : plus aucun doublon actif.
SELECT COUNT(*) AS doublons_actifs_restants FROM (
  SELECT `meeting_id`, `member_id`
  FROM `meeting_has_member`
  WHERE `deleted_at` IS NULL
  GROUP BY `meeting_id`, `member_id`
  HAVING COUNT(*) > 1
) AS d;
