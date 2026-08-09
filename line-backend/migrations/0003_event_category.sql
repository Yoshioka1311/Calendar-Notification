ALTER TABLE incoming_events ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'
  CHECK (category IN ('Personal', 'Work', 'School', 'Meeting', 'Health', 'Important', 'Other'));
