ALTER TABLE staff_grants
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled'));

ALTER TABLE operator_grants
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled'));
