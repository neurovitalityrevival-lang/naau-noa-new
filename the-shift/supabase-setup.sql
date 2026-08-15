-- =====================================================
-- スキルマネタイズスクール 予約システム
-- Supabase SQL Editor で実行してください（初回のみ）
-- =====================================================

-- 既存テーブルがある場合は先に削除（注意：データが消えます）
-- DROP TABLE IF EXISTS bookings;
-- DROP TABLE IF EXISTS slots;
-- DROP TABLE IF EXISTS admin_settings;

CREATE TABLE IF NOT EXISTS slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  start_time time NOT NULL,
  is_available boolean DEFAULT true,
  is_booked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, start_time)
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id uuid REFERENCES slots(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  menu text NOT NULL,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO admin_settings (key, value)
VALUES ('daily_capacity_mins', '180')
ON CONFLICT (key) DO NOTHING;

-- RLS 有効化
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- ポリシー（既存があれば先に DROP）
DROP POLICY IF EXISTS "Public read slots" ON slots;
DROP POLICY IF EXISTS "Public update slots" ON slots;
DROP POLICY IF EXISTS "Public insert slots" ON slots;
DROP POLICY IF EXISTS "Public delete slots" ON slots;
DROP POLICY IF EXISTS "Public insert bookings" ON bookings;
DROP POLICY IF EXISTS "Public read admin_settings" ON admin_settings;
DROP POLICY IF EXISTS "Public upsert settings" ON admin_settings;
DROP POLICY IF EXISTS "Service role all" ON slots;
DROP POLICY IF EXISTS "Service role bookings all" ON bookings;
DROP POLICY IF EXISTS "Service role settings all" ON admin_settings;

CREATE POLICY "Public read slots"          ON slots          FOR SELECT USING (true);
CREATE POLICY "Public insert slots"        ON slots          FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update slots"        ON slots          FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete slots"        ON slots          FOR DELETE USING (true);
CREATE POLICY "Public insert bookings"     ON bookings       FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read admin_settings" ON admin_settings FOR SELECT USING (true);
CREATE POLICY "Public upsert settings"     ON admin_settings FOR ALL    USING (true) WITH CHECK (true);
CREATE POLICY "Service role all"           ON slots          FOR ALL    USING (true);
CREATE POLICY "Service role bookings all"  ON bookings      FOR ALL    USING (true);
CREATE POLICY "Service role settings all"  ON admin_settings FOR ALL   USING (true);
