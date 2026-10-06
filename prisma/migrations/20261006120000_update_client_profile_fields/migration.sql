-- AlterTable
ALTER TABLE `client_profiles` MODIFY `company_name` VARCHAR(150) NOT NULL;
ALTER TABLE `client_profiles` DROP INDEX `client_profiles_slug_key`;
ALTER TABLE `client_profiles` CHANGE COLUMN `slug` `url_slug` VARCHAR(100) NOT NULL;
CREATE UNIQUE INDEX `client_profiles_url_slug_key` ON `client_profiles`(`url_slug`);
ALTER TABLE `client_profiles` MODIFY `logo_url` VARCHAR(512) NULL;
