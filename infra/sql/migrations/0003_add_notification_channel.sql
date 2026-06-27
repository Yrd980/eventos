ALTER TABLE notifications
  ADD COLUMN channel text NOT NULL DEFAULT 'miniapp'
    CHECK (channel IN ('miniapp', 'sms', 'email', 'wechat'));
