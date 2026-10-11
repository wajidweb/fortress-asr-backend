-- AlterTable
ALTER TABLE `audit_logs` ADD COLUMN `entity_id` VARCHAR(255) NULL,
    ADD COLUMN `entity_type` VARCHAR(255) NULL,
    MODIFY `action` VARCHAR(512) NOT NULL,
    MODIFY `details` MEDIUMTEXT NOT NULL,
    MODIFY `ip_address` VARCHAR(255) NULL;
