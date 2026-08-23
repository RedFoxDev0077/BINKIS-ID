-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EditionType" AS ENUM ('CLASSIC', 'LIMITED', 'LEGENDARY', 'SPARE', 'ARTIST_PROOF');

-- CreateEnum
CREATE TYPE "PieceStatus" AS ENUM ('UNCLAIMED', 'CLAIMED', 'VOID', 'RESERVED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXPORTED', 'PRINTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AcquiredVia" AS ENUM ('CLAIM', 'TRANSFER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collector_ids" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "public_profile" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "collector_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "character" TEXT NOT NULL,
    "character_code" CHAR(2) NOT NULL,
    "edition_type" "EditionType" NOT NULL,
    "series" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "run_size" INTEGER NOT NULL,
    "artwork_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "exported_at" TIMESTAMP(3),
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces" (
    "id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "claim_hash" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "edition_number" INTEGER,
    "production_year" INTEGER NOT NULL,
    "produced_at" TIMESTAMP(3) NOT NULL,
    "country" TEXT NOT NULL,
    "status" "PieceStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_events" (
    "id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "from_collector_id" UUID,
    "to_collector_id" UUID NOT NULL,
    "acquired_via" "AcquiredVia" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_events" (
    "id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "actor" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "passport_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_attempts" (
    "id" UUID NOT NULL,
    "ip" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "collector_ids_user_id_key" ON "collector_ids"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_character_code_edition_type_series_key" ON "products"("character_code", "edition_type", "series");

-- CreateIndex
CREATE UNIQUE INDEX "batches_code_key" ON "batches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_serial_key" ON "pieces"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_qr_token_key" ON "pieces"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_claim_hash_key" ON "pieces"("claim_hash");

-- CreateIndex
CREATE INDEX "pieces_batch_id_idx" ON "pieces"("batch_id");

-- CreateIndex
CREATE INDEX "pieces_status_idx" ON "pieces"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_product_id_edition_number_key" ON "pieces"("product_id", "edition_number");

-- CreateIndex
CREATE INDEX "ownership_events_to_collector_id_idx" ON "ownership_events"("to_collector_id");

-- CreateIndex
CREATE UNIQUE INDEX "ownership_events_piece_id_seq_key" ON "ownership_events"("piece_id", "seq");

-- CreateIndex
CREATE INDEX "passport_events_piece_id_occurred_at_idx" ON "passport_events"("piece_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "passport_events_piece_id_seq_key" ON "passport_events"("piece_id", "seq");

-- CreateIndex
CREATE INDEX "audit_logs_entity_at_idx" ON "audit_logs"("entity", "at");

-- CreateIndex
CREATE INDEX "claim_attempts_ip_at_idx" ON "claim_attempts"("ip", "at");

-- AddForeignKey
ALTER TABLE "collector_ids" ADD CONSTRAINT "collector_ids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_from_collector_id_fkey" FOREIGN KEY ("from_collector_id") REFERENCES "collector_ids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_to_collector_id_fkey" FOREIGN KEY ("to_collector_id") REFERENCES "collector_ids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_events" ADD CONSTRAINT "passport_events_piece_id_fkey" FOREIGN KEY ("piece_id") REFERENCES "pieces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

