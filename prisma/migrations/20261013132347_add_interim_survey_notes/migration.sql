-- AlterTable
ALTER TABLE `site_service_requests` ADD COLUMN `survey_conducted_at` DATETIME(3) NULL,
    ADD COLUMN `survey_contact_name` VARCHAR(100) NULL,
    ADD COLUMN `survey_contact_phone` VARCHAR(50) NULL,
    ADD COLUMN `survey_geofence_radius_meters` INTEGER NULL,
    ADD COLUMN `survey_latitude` DECIMAL(9, 6) NULL,
    ADD COLUMN `survey_longitude` DECIMAL(9, 6) NULL,
    ADD COLUMN `survey_notes` TEXT NULL;
