CREATE TABLE `Customer` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `phone` VARCHAR(12) NOT NULL,
  `subscribed` BOOLEAN NOT NULL DEFAULT true,
  `consentAt` DATETIME(3) NOT NULL,
  `consentVersion` VARCHAR(40) NOT NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'web',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Customer_email_key` (`email`),
  UNIQUE INDEX `Customer_phone_key` (`phone`),
  INDEX `Customer_createdAt_idx` (`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
