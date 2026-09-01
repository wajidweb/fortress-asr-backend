-- AlterTable
ALTER TABLE `guard_profiles` ADD COLUMN `first_name` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `last_name` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `rtw_document_type` VARCHAR(191) NULL,
    ADD COLUMN `rtw_document_url` VARCHAR(191) NULL;
