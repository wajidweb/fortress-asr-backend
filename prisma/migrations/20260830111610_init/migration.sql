-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `role` ENUM('SYSTEM_ADMIN', 'SUPERVISOR', 'SECURITY_GUARD', 'CLIENT') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guard_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `sia_licence_number` VARCHAR(191) NULL,
    `sia_expiry_date` DATETIME(3) NULL,
    `rtw_expiry_date` DATETIME(3) NULL,
    `has_indefinite_rtw` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `pay_rate_per_hour` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `phone_number` VARCHAR(191) NULL,
    `emergency_contact_name` VARCHAR(191) NULL,
    `emergency_contact_phone` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `guard_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `company_name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `billing_address` VARCHAR(191) NULL,
    `billing_rate_hour` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `contact_person` VARCHAR(191) NULL,
    `contact_phone` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `client_profiles_user_id_key`(`user_id`),
    UNIQUE INDEX `client_profiles_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sites` (
    `id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `latitude` DECIMAL(10, 8) NOT NULL,
    `longitude` DECIMAL(11, 8) NOT NULL,
    `geofence_radius_meter` INTEGER NOT NULL DEFAULT 100,
    `site_instructions` TEXT NULL,
    `emergency_contact` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sites_client_id_idx`(`client_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shifts` (
    `id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `guard_id` VARCHAR(191) NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'MISSED', 'ESCALATED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `pre_shift_confirmed_at` DATETIME(3) NULL,
    `check_in_time` DATETIME(3) NULL,
    `check_in_latitude` DECIMAL(10, 8) NULL,
    `check_in_longitude` DECIMAL(11, 8) NULL,
    `check_in_photo_url` VARCHAR(191) NULL,
    `check_in_sia_badge_photo` VARCHAR(191) NULL,
    `check_in_ppe_verified` BOOLEAN NOT NULL DEFAULT false,
    `check_out_time` DATETIME(3) NULL,
    `check_out_latitude` DECIMAL(10, 8) NULL,
    `check_out_longitude` DECIMAL(11, 8) NULL,
    `check_out_photo_url` VARCHAR(191) NULL,
    `guard_pay_rate_hour` DECIMAL(10, 2) NOT NULL,
    `client_billing_rate_hour` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shifts_site_id_idx`(`site_id`),
    INDEX `shifts_guard_id_idx`(`guard_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patrol_routes` (
    `id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `patrol_routes_site_id_idx`(`site_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checkpoints` (
    `id` VARCHAR(191) NOT NULL,
    `route_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `qr_code_token` VARCHAR(191) NOT NULL,
    `latitude` DECIMAL(10, 8) NOT NULL,
    `longitude` DECIMAL(11, 8) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `checkpoints_qr_code_token_key`(`qr_code_token`),
    INDEX `checkpoints_route_id_idx`(`route_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patrol_logs` (
    `id` VARCHAR(191) NOT NULL,
    `route_id` VARCHAR(191) NOT NULL,
    `checkpoint_id` VARCHAR(191) NOT NULL,
    `guard_id` VARCHAR(191) NOT NULL,
    `scanned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `latitude` DECIMAL(10, 8) NOT NULL,
    `longitude` DECIMAL(11, 8) NOT NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT true,

    INDEX `patrol_logs_route_id_idx`(`route_id`),
    INDEX `patrol_logs_checkpoint_id_idx`(`checkpoint_id`),
    INDEX `patrol_logs_guard_id_idx`(`guard_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `incidents` (
    `id` VARCHAR(191) NOT NULL,
    `guard_id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `shift_id` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('REPORTED', 'INVESTIGATING', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'REPORTED',
    `evidence_media_urls` TEXT NULL,
    `voice_note_url` VARCHAR(191) NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `is_published_to_client` BOOLEAN NOT NULL DEFAULT false,
    `investigation_notes` TEXT NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `incidents_guard_id_idx`(`guard_id`),
    INDEX `incidents_site_id_idx`(`site_id`),
    INDEX `incidents_shift_id_idx`(`shift_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dob_entries` (
    `id` VARCHAR(191) NOT NULL,
    `site_id` VARCHAR(191) NOT NULL,
    `guard_id` VARCHAR(191) NOT NULL,
    `shift_id` VARCHAR(191) NULL,
    `occurrence` TEXT NOT NULL,
    `logged_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dob_entries_site_id_idx`(`site_id`),
    INDEX `dob_entries_guard_id_idx`(`guard_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `handovers` (
    `id` VARCHAR(191) NOT NULL,
    `outgoing_shift_id` VARCHAR(191) NOT NULL,
    `incoming_shift_id` VARCHAR(191) NOT NULL,
    `incoming_guard_id` VARCHAR(191) NOT NULL,
    `transition_notes` TEXT NOT NULL,
    `acknowledged_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `handovers_outgoing_shift_id_idx`(`outgoing_shift_id`),
    INDEX `handovers_incoming_shift_id_idx`(`incoming_shift_id`),
    INDEX `handovers_incoming_guard_id_idx`(`incoming_guard_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equipment` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `serial_number` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `condition` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `equipment_serial_number_key`(`serial_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equipment_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `equipment_id` VARCHAR(191) NOT NULL,
    `guard_id` VARCHAR(191) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `returned_at` DATETIME(3) NULL,
    `out_condition` VARCHAR(191) NOT NULL,
    `in_condition` VARCHAR(191) NULL,

    INDEX `equipment_assignments_equipment_id_idx`(`equipment_id`),
    INDEX `equipment_assignments_guard_id_idx`(`guard_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` TEXT NOT NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `guard_profiles` ADD CONSTRAINT `guard_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_profiles` ADD CONSTRAINT `client_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sites` ADD CONSTRAINT `sites_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `client_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_guard_id_fkey` FOREIGN KEY (`guard_id`) REFERENCES `guard_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patrol_routes` ADD CONSTRAINT `patrol_routes_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkpoints` ADD CONSTRAINT `checkpoints_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `patrol_routes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patrol_logs` ADD CONSTRAINT `patrol_logs_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `patrol_routes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patrol_logs` ADD CONSTRAINT `patrol_logs_checkpoint_id_fkey` FOREIGN KEY (`checkpoint_id`) REFERENCES `checkpoints`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patrol_logs` ADD CONSTRAINT `patrol_logs_guard_id_fkey` FOREIGN KEY (`guard_id`) REFERENCES `guard_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_guard_id_fkey` FOREIGN KEY (`guard_id`) REFERENCES `guard_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dob_entries` ADD CONSTRAINT `dob_entries_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dob_entries` ADD CONSTRAINT `dob_entries_guard_id_fkey` FOREIGN KEY (`guard_id`) REFERENCES `guard_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dob_entries` ADD CONSTRAINT `dob_entries_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handovers` ADD CONSTRAINT `handovers_outgoing_shift_id_fkey` FOREIGN KEY (`outgoing_shift_id`) REFERENCES `shifts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handovers` ADD CONSTRAINT `handovers_incoming_shift_id_fkey` FOREIGN KEY (`incoming_shift_id`) REFERENCES `shifts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handovers` ADD CONSTRAINT `handovers_incoming_guard_id_fkey` FOREIGN KEY (`incoming_guard_id`) REFERENCES `guard_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_assignments` ADD CONSTRAINT `equipment_assignments_equipment_id_fkey` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_assignments` ADD CONSTRAINT `equipment_assignments_guard_id_fkey` FOREIGN KEY (`guard_id`) REFERENCES `guard_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
