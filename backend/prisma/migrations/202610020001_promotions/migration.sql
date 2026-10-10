CREATE TABLE `Promotion` (
 `id` CHAR(36) NOT NULL, `name` VARCHAR(120) NOT NULL, `benefit` VARCHAR(500) NOT NULL,
 `conditions` TEXT NOT NULL, `code` VARCHAR(40) NOT NULL, `imageUrl` VARCHAR(500) NOT NULL,
 `startsAt` DATETIME(3) NOT NULL, `endsAt` DATETIME(3) NOT NULL, `paused` BOOLEAN NOT NULL DEFAULT false,
 `revision` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 UNIQUE INDEX `Promotion_code_key` (`code`), INDEX `Promotion_startsAt_endsAt_idx` (`startsAt`, `endsAt`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `Campaign` (
 `id` CHAR(36) NOT NULL, `requestKey` CHAR(36) NOT NULL, `promotionId` CHAR(36) NOT NULL,
 `subject` VARCHAR(150) NOT NULL, `preheader` VARCHAR(200) NOT NULL, `segment` VARCHAR(20) NOT NULL,
 `mode` VARCHAR(10) NOT NULL, `status` VARCHAR(20) NOT NULL DEFAULT 'queued', `snapshot` JSON NOT NULL,
 `scheduledAt` DATETIME(3) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `startedAt` DATETIME(3) NULL, `finishedAt` DATETIME(3) NULL, `leaseUntil` DATETIME(3) NULL,
 `leaseOwner` CHAR(36) NULL, `note` VARCHAR(255) NULL,
 UNIQUE INDEX `Campaign_requestKey_key` (`requestKey`), INDEX `Campaign_status_mode_scheduledAt_idx` (`status`, `mode`, `scheduledAt`), PRIMARY KEY (`id`),
 CONSTRAINT `Campaign_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `Promotion` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `CampaignRecipient` (
 `id` CHAR(36) NOT NULL, `campaignId` CHAR(36) NOT NULL, `customerId` CHAR(36) NOT NULL,
 `email` VARCHAR(254) NOT NULL, `name` VARCHAR(100) NOT NULL, `tokenHash` CHAR(64) NOT NULL,
 `status` VARCHAR(20) NOT NULL DEFAULT 'pending', `attempts` INTEGER NOT NULL DEFAULT 0,
 `retryAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `processedAt` DATETIME(3) NULL,
 `detail` VARCHAR(255) NULL, `messageId` VARCHAR(255) NULL, `html` LONGTEXT NOT NULL, `text` TEXT NOT NULL,
 UNIQUE INDEX `CampaignRecipient_tokenHash_key` (`tokenHash`), UNIQUE INDEX `CampaignRecipient_campaignId_customerId_key` (`campaignId`, `customerId`),
 INDEX `CampaignRecipient_campaignId_status_retryAt_idx` (`campaignId`, `status`, `retryAt`), INDEX `CampaignRecipient_customerId_fkey` (`customerId`), PRIMARY KEY (`id`),
 CONSTRAINT `CampaignRecipient_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `CampaignRecipient_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
