-- ====================================================================
-- MediCare Hospital - PostgreSQL Database Schema
-- Compatible with Supabase PostgreSQL
-- ====================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Helper function to automatically update timestamps
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------
-- 3. Doctors Table
-- Stores hospital medical staff and their specializations
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  specialization VARCHAR(100) NOT NULL,
  department VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  consultation_fee NUMERIC(10, 2) DEFAULT 0.00,
  available_days TEXT[] DEFAULT ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 4. Patients / Profiles Table
-- Stores user profiles for hospital patients
-- (Access-control and patient-sensitive data isolated for future auth)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(20) CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 5. Appointments Table
-- Stores scheduled appointments between patients and doctors
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique Constraint: Prevent duplicate bookings for same doctor, date and time
  CONSTRAINT unique_doctor_appointment_slot UNIQUE (doctor_id, appointment_date, appointment_time)
);

-- --------------------------------------------------------------------
-- 6. Performance Indexes
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_doctors_specialization ON doctors(specialization);
CREATE INDEX IF NOT EXISTS idx_doctors_is_active ON doctors(is_active);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

-- --------------------------------------------------------------------
-- 7. Update Triggers
-- --------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_doctors_updated_at ON doctors;
CREATE TRIGGER trigger_doctors_updated_at
  BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_appointments_updated_at ON appointments;
CREATE TRIGGER trigger_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------
-- 8. Row Level Security (RLS)
-- --------------------------------------------------------------------
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active doctors for directory listing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'doctors' AND policyname = 'Allow public read access for active doctors'
  ) THEN
    CREATE POLICY "Allow public read access for active doctors"
      ON doctors FOR SELECT
      USING (is_active = TRUE);
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 9. Seed Sample Doctor Data
-- --------------------------------------------------------------------
INSERT INTO doctors (name, specialization, department, email, phone, consultation_fee, available_days)
VALUES
  ('Dr. Sarah Jenkins', 'Cardiology', 'Cardiology & Heart Care', 's.jenkins@medicare.local', '+1-555-0101', 120.00, ARRAY['Monday', 'Wednesday', 'Friday']),
  ('Dr. Michael Chen', 'Neurology', 'Neurology Department', 'm.chen@medicare.local', '+1-555-0102', 150.00, ARRAY['Tuesday', 'Thursday']),
  ('Dr. Emily Rodriguez', 'Pediatrics', 'Child Health & Pediatrics', 'e.rodriguez@medicare.local', '+1-555-0103', 95.00, ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
  ('Dr. Robert Taylor', 'Orthopedics', 'Bone & Joint Surgery', 'r.taylor@medicare.local', '+1-555-0104', 130.00, ARRAY['Monday', 'Wednesday', 'Thursday'])
ON CONFLICT (email) DO NOTHING;
