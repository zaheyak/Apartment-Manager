CREATE TABLE IF NOT EXISTS administrators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE administrators ADD COLUMN IF NOT EXISTS username TEXT;
UPDATE administrators
SET username = split_part(email, '@', 1)
WHERE username IS NULL;
ALTER TABLE administrators ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS administrators_username_lower_unique
  ON administrators (lower(username));

CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS apartments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id),
  number TEXT NOT NULL,
  floor TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('occupied', 'vacant')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (building_id, number)
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  monthly_rent NUMERIC(12,2) NOT NULL CHECK (monthly_rent >= 0),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS leases_one_active_per_apartment
  ON leases (apartment_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS meters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  meter_type TEXT NOT NULL CHECK (meter_type IN ('electricity', 'water')),
  UNIQUE (apartment_id, meter_type)
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id UUID NOT NULL REFERENCES meters(id),
  charge_year INT NOT NULL,
  charge_month INT NOT NULL CHECK (charge_month BETWEEN 1 AND 12),
  previous_value NUMERIC(14,3) NOT NULL CHECK (previous_value >= 0),
  current_value NUMERIC(14,3) NOT NULL CHECK (current_value >= 0),
  consumption NUMERIC(14,3) NOT NULL CHECK (consumption >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meter_id, charge_year, charge_month),
  CHECK (current_value >= previous_value),
  CHECK (consumption = current_value - previous_value)
);

CREATE TABLE IF NOT EXISTS utility_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_type TEXT NOT NULL CHECK (meter_type IN ('electricity', 'water')),
  price NUMERIC(12,4) NOT NULL CHECK (price >= 0),
  effective_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tariffs_lookup
  ON utility_tariffs (meter_type, effective_from DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS monthly_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  lease_id UUID REFERENCES leases(id),
  meter_reading_id UUID REFERENCES meter_readings(id),
  charge_year INT NOT NULL,
  charge_month INT NOT NULL CHECK (charge_month BETWEEN 1 AND 12),
  category TEXT NOT NULL CHECK (category IN ('rent', 'electricity', 'water')),
  amount_due NUMERIC(12,2) NOT NULL CHECK (amount_due >= 0),
  tariff_price NUMERIC(12,4),
  previous_reading NUMERIC(14,3),
  current_reading NUMERIC(14,3),
  consumption NUMERIC(14,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apartment_id, charge_year, charge_month, category),
  CHECK (
    category = 'rent'
    OR (
      previous_reading IS NOT NULL
      AND current_reading IS NOT NULL
      AND consumption IS NOT NULL
      AND current_reading >= previous_reading
      AND consumption = current_reading - previous_reading
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_charges_apartment_period
  ON monthly_charges (apartment_id, charge_year, charge_month);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  tenant_name TEXT,
  payment_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'check', 'other')),
  category TEXT NOT NULL CHECK (category IN ('rent', 'electricity', 'water', 'multiple')),
  billing_year INT NOT NULL,
  billing_month INT NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
  notes TEXT NOT NULL DEFAULT '',
  reference_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_apartment
  ON payments (apartment_id, payment_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  monthly_charge_id UUID NOT NULL REFERENCES monthly_charges(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_allocations_charge ON payment_allocations (monthly_charge_id);
CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations (payment_id);

CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1;

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE NOT NULL,
  payment_id UUID NOT NULL UNIQUE REFERENCES payments(id),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_apartment
  ON payment_receipts (apartment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  receipt_id UUID REFERENCES payment_receipts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_apartment ON documents (apartment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES administrators(id),
  apartment_id UUID REFERENCES apartments(id),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_apartment ON audit_logs (apartment_id, created_at DESC);
