/*
  Warnings:

  - You are about to drop the column `client_id` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `client_profiles` DROP FOREIGN KEY `fk_client_profile_owner`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `fk_user_client_users`;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `client_id`;

-- AddForeignKey
ALTER TABLE `client_profiles` ADD CONSTRAINT `client_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
