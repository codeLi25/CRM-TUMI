ALTER TABLE `Customer` ADD COLUMN `redemptionCount` INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN `lastRedemptionAt` DATETIME(3) NULL;
CREATE TABLE `Redemption` (
 `id` CHAR(36) NOT NULL, `requestKey` CHAR(36) NOT NULL,
 `customerId` CHAR(36) NOT NULL, `promotionId` CHAR(36) NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `customerName` VARCHAR(100) NOT NULL, `customerPhone` VARCHAR(12) NOT NULL,
 `promotionName` VARCHAR(120) NOT NULL, `code` VARCHAR(40) NOT NULL,
 `benefit` VARCHAR(500) NOT NULL, `conditions` TEXT NOT NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `Redemption_requestKey_key` (`requestKey`),
 UNIQUE INDEX `Redemption_customerId_promotionId_key` (`customerId`,`promotionId`),
 INDEX `Redemption_createdAt_id_idx` (`createdAt`,`id`), INDEX `Redemption_promotionId_idx` (`promotionId`),
 CONSTRAINT `Redemption_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT `Redemption_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `Promotion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
