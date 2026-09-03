-- Phase 91.8 — additive NotificationType enum values for the generalized DOCUMENT and SYSTEM
-- notification categories. Every existing enum value and every existing Notification row is
-- untouched; this only adds two new labels that can be used going forward.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM';
