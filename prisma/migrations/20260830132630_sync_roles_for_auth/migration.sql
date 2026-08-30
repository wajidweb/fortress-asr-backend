/*
  Warnings:

  - The values [SYSTEM_ADMIN,SECURITY_GUARD] on the enum `users_role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'SUPERVISOR', 'GUARD', 'CLIENT') NOT NULL;
