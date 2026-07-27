CREATE TABLE IF NOT EXISTS planner_timetrack_webhook_inbox (
  event_id varchar(64) PRIMARY KEY,
  event_type varchar(48) NOT NULL,
  entity_type varchar(16) NOT NULL,
  entity_uuid varchar(64) NOT NULL,
  occurred_at timestamp NOT NULL,
  status varchar(16) NOT NULL,
  received_at timestamp NOT NULL,
  processing_started_at timestamp NULL,
  processing_token varchar(64) NULL,
  completed_at timestamp NULL,
  last_error text NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_timetrack_webhook_inbox_status
  ON planner_timetrack_webhook_inbox (status, received_at);
