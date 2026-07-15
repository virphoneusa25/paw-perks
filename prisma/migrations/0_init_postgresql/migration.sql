-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyCustomer" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'PAW_PAL',
    "referralCode" TEXT,
    "birthday" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "loyaltyCustomerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "shopifyOrderId" TEXT,
    "shopifyRefundId" TEXT,
    "redemptionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "loyaltyCustomerId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderNumber" TEXT,
    "eligibleSubtotal" INTEGER NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "pointsReversed" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT,
    "paidAt" TIMESTAMP(3),
    "fullyRefundedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "processedOrderId" TEXT NOT NULL,
    "shopifyRefundId" TEXT NOT NULL,
    "refundedSubtotal" INTEGER NOT NULL,
    "pointsReversed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardDefinition" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pointsRequired" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minimumSpend" INTEGER,
    "expiresInDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "loyaltyCustomerId" TEXT NOT NULL,
    "rewardDefinitionId" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "discountCode" TEXT NOT NULL,
    "shopifyDiscountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltySettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "programName" TEXT NOT NULL DEFAULT 'Paw Perks',
    "pointsPerSpendCents" INTEGER NOT NULL DEFAULT 200,
    "pointsPerUnit" INTEGER NOT NULL DEFAULT 1,
    "signupBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "birthdayBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "referralBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "excludeTaxes" BOOLEAN NOT NULL DEFAULT true,
    "excludeShipping" BOOLEAN NOT NULL DEFAULT true,
    "excludeGiftCards" BOOLEAN NOT NULL DEFAULT true,
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCustomer_referralCode_key" ON "LoyaltyCustomer"("referralCode");

-- CreateIndex
CREATE INDEX "LoyaltyCustomer_shop_idx" ON "LoyaltyCustomer"("shop");

-- CreateIndex
CREATE INDEX "LoyaltyCustomer_email_idx" ON "LoyaltyCustomer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCustomer_shop_shopifyCustomerId_key" ON "LoyaltyCustomer"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_idempotencyKey_key" ON "PointTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PointTransaction_shop_loyaltyCustomerId_idx" ON "PointTransaction"("shop", "loyaltyCustomerId");

-- CreateIndex
CREATE INDEX "PointTransaction_shopifyOrderId_idx" ON "PointTransaction"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "PointTransaction_createdAt_idx" ON "PointTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "ProcessedOrder_shop_loyaltyCustomerId_idx" ON "ProcessedOrder"("shop", "loyaltyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedOrder_shop_shopifyOrderId_key" ON "ProcessedOrder"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "RefundRecord_processedOrderId_idx" ON "RefundRecord"("processedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRecord_shop_shopifyRefundId_key" ON "RefundRecord"("shop", "shopifyRefundId");

-- CreateIndex
CREATE INDEX "RewardDefinition_shop_isActive_idx" ON "RewardDefinition"("shop", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RewardDefinition_shop_key_key" ON "RewardDefinition"("shop", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRedemption_discountCode_key" ON "RewardRedemption"("discountCode");

-- CreateIndex
CREATE INDEX "RewardRedemption_shop_loyaltyCustomerId_idx" ON "RewardRedemption"("shop", "loyaltyCustomerId");

-- CreateIndex
CREATE INDEX "RewardRedemption_shop_status_idx" ON "RewardRedemption"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltySettings_shop_key" ON "LoyaltySettings"("shop");

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_loyaltyCustomerId_fkey" FOREIGN KEY ("loyaltyCustomerId") REFERENCES "LoyaltyCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedOrder" ADD CONSTRAINT "ProcessedOrder_loyaltyCustomerId_fkey" FOREIGN KEY ("loyaltyCustomerId") REFERENCES "LoyaltyCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_processedOrderId_fkey" FOREIGN KEY ("processedOrderId") REFERENCES "ProcessedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_loyaltyCustomerId_fkey" FOREIGN KEY ("loyaltyCustomerId") REFERENCES "LoyaltyCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardDefinitionId_fkey" FOREIGN KEY ("rewardDefinitionId") REFERENCES "RewardDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
