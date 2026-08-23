-- Runs once, on first initialisation of the data volume.
--
-- The staging database exists so the batch generator can claim every
-- generated code and assert it opens its own piece, then reset. That
-- rehearsal must never run against the live registry: it claims every piece
-- it touches, which would burn an entire production batch.
CREATE DATABASE binkis_staging OWNER binkis;
