-- Cria vínculo direto entre promoters e usuários de login

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'promoters'
    AND column_name = 'user_id'
);

SET @add_column_sql := IF(
  @column_exists = 0,
  'ALTER TABLE `promoters` ADD COLUMN `user_id` INT NULL AFTER `instagram`;',
  'SELECT "Column `user_id` already exists";'
);

PREPARE stmt FROM @add_column_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'promoters'
    AND index_name = 'idx_promoters_user_id'
);

SET @add_index_sql := IF(
  @index_exists = 0,
  'ALTER TABLE `promoters` ADD INDEX `idx_promoters_user_id` (`user_id`);',
  'SELECT "Index `idx_promoters_user_id` already exists";'
);

PREPARE stmt FROM @add_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND constraint_name = 'fk_promoters_user'
    AND table_name = 'promoters'
);

SET @add_fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `promoters` ADD CONSTRAINT `fk_promoters_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;',
  'SELECT "Foreign key `fk_promoters_user` already exists";'
);

PREPARE stmt FROM @add_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;