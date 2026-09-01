/*
  Warnings:

  - Made the column `billing_address` on table `client_profiles` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `client_profiles` DROP FOREIGN KEY `client_profiles_user_id_fkey`;

-- AlterTable
ALTER TABLE `client_profiles` ADD COLUMN `logo_url` VARCHAR(191) NULL,
    MODIFY `billing_address` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `client_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `fk_user_client_users` FOREIGN KEY (`client_id`) REFERENCES `client_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_profiles` ADD CONSTRAINT `fk_client_profile_owner` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
