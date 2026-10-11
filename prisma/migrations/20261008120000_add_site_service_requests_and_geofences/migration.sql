-- AlterTable
ALTER TABLE `sites` DROP COLUMN `geofence_radius_meter`,
    ADD COLUMN `geofence_radius_meters` INTEGER NOT NULL DEFAULT 100,
    MODIFY `name` VARCHAR(150) NOT NULL,
    MODIFY `address` TEXT NOT NULL,
    MODIFY `latitude` DECIMAL(9, 6) NOT NULL,
    MODIFY `longitude` DECIMAL(9, 6) NOT NULL;

-- CreateTable
CREATE TABLE `site_service_requests` (
    `id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NULL,
    `type` ENUM('NEW_SITE_DEPLOYMENT', 'EXTRA_GUARD_COVERAGE', 'SCHEDULE_CHANGE', 'SPECIAL_EVENT') NOT NULL DEFAULT 'NEW_SITE_DEPLOYMENT',
    `status` ENUM('PENDING_REVIEW', 'UNDER_ASSESSMENT', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `urgency` ENUM('STANDARD', 'PRIORITY', 'EMERGENCY') NOT NULL DEFAULT 'STANDARD',
    `property_name` VARCHAR(150) NOT NULL,
    `property_address` TEXT NOT NULL,
    `city` VARCHAR(100) NULL,
    `postcode` VARCHAR(20) NULL,
    `suggested_latitude` DECIMAL(9, 6) NULL,
    `suggested_longitude` DECIMAL(9, 6) NULL,
    `required_guards_count` INTEGER NOT NULL DEFAULT 1,
    `service_start_date` DATETIME(3) NOT NULL,
    `service_end_date` DATETIME(3) NULL,
    `shift_schedule_notes` TEXT NULL,
    `special_instructions` TEXT NULL,
    `emergency_contact_name` VARCHAR(191) NULL,
    `emergency_contact_phone` VARCHAR(191) NULL,
    `admin_feedback_notes` TEXT NULL,
    `reviewed_by_user_id` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `site_service_requests_client_id_idx`(`client_id`),
    INDEX `site_service_requests_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `site_service_requests` ADD CONSTRAINT `site_service_requests_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `client_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `site_service_requests` ADD CONSTRAINT `site_service_requests_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
