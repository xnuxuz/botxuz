-- AlterTable
ALTER TABLE `categories` ADD COLUMN `default_reminder_minutes` INTEGER NULL;

-- AlterTable
ALTER TABLE `events` ADD COLUMN `reminder_offsets` JSON NULL;

-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `reminder_offsets` JSON NULL;
