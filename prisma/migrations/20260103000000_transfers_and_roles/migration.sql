-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('COLLECTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'COLLECTOR';

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "from_collector_id" UUID NOT NULL,
    "to_collector_id" UUID,
    "to_email" TEXT,
    "to_handle" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfers_to_collector_id_status_idx" ON "transfers"("to_collector_id", "status");

-- CreateIndex
CREATE INDEX "transfers_to_email_status_idx" ON "transfers"("to_email", "status");

-- CreateIndex
CREATE INDEX "transfers_from_collector_id_status_idx" ON "transfers"("from_collector_id", "status");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_collector_id_fkey" FOREIGN KEY ("from_collector_id") REFERENCES "collector_ids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_collector_id_fkey" FOREIGN KEY ("to_collector_id") REFERENCES "collector_ids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A piece may have at most ONE transfer in flight at a time.
--
-- Prisma cannot express a partial unique index, so it is added by hand. It
-- matters: without it an owner could open two pending transfers for the same
-- piece, and two different people would each be told the piece is coming to
-- them. Enforcing it here makes that impossible rather than merely unlikely.
CREATE UNIQUE INDEX "transfers_one_pending_per_piece"
  ON "transfers" ("piece_id")
  WHERE "status" = 'PENDING';
