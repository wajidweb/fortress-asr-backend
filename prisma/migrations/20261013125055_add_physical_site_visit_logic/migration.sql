-- AlterTable
ALTER TABLE `site_service_requests` ADD COLUMN `visit_assignee_id` VARCHAR(191) NULL,
    ADD COLUMN `visit_scheduled_at` DATETIME(3) NULL,
    ADD COLUMN `visit_status` ENUM('PENDING', 'COMPLETED', 'CANCELLED') NULL;

-- CreateIndex
CREATE INDEX `site_service_requests_visit_assignee_id_idx` ON `site_service_requests`(`visit_assignee_id`);

-- AddForeignKey
ALTER TABLE `site_service_requests` ADD CONSTRAINT `site_service_requests_visit_assignee_id_fkey` FOREIGN KEY (`visit_assignee_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
