ALTER TABLE planner_timetrack_webhook_inbox
  ADD COLUMN IF NOT EXISTS processing_token varchar(64) NULL;
