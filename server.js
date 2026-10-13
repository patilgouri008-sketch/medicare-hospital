const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Supabase Database Client & Diagnostics
const { supabase, isConfigured, testConnection } = require('./db/supabase');

// Health check endpoint (checks server & tests real database connection)
app.get('/api/health', async (req, res) => {
  const dbStatus = await testConnection();

  res.status(200).json({
    status: 'ok',
    service: 'MediCare Hospital API',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Doctors listing endpoint
app.get('/api/doctors', async (req, res) => {
  if (!isConfigured || !supabase) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_SECRET_KEY in your .env file.',
      data: []
    });
  }

  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('id, name, specialization, department, email, phone, consultation_fee, available_days, is_active, created_at')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        data: []
      });
    }

    return res.status(200).json({
      success: true,
      count: data ? data.length : 0,
      data: data || []
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      data: []
    });
  }
});

// Get booked time slots for a specific doctor and date
app.get('/api/appointments/booked-slots', async (req, res) => {
  if (!isConfigured || !supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured.' });
  }

  const { doctor_id, date } = req.query;
  if (!doctor_id || !date) {
    return res.status(400).json({
      success: false,
      error: 'Both doctor_id and date query parameters are required.'
    });
  }

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_time')
      .eq('doctor_id', doctor_id)
      .eq('appointment_date', date)
      .neq('status', 'cancelled');

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    // Format times as HH:MM
    const booked = (data || []).map(row => row.appointment_time.slice(0, 5));
    return res.status(200).json({ success: true, bookedSlots: booked });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// List appointments (with doctor & patient details)
app.get('/api/appointments', async (req, res) => {
  if (!isConfigured || !supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured.' });
  }

  try {
    const { doctor_id, date, email } = req.query;
    let query = supabase
      .from('appointments')
      .select(`
        id,
        appointment_date,
        appointment_time,
        status,
        notes,
        created_at,
        doctors ( id, name, specialization, department ),
        profiles ( id, full_name, email, phone )
      `)
      .order('appointment_date', { ascending: false })
      .order('appointment_time', { ascending: false })
      .limit(50);

    if (doctor_id) query = query.eq('doctor_id', doctor_id);
    if (date) query = query.eq('appointment_date', date);

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    // If filtered by email, apply filter
    let results = data || [];
    if (email) {
      results = results.filter(
        item => item.profiles && item.profiles.email && item.profiles.email.toLowerCase() === email.toLowerCase().trim()
      );
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create new appointment with duplicate slot prevention
app.post('/api/appointments', async (req, res) => {
  if (!isConfigured || !supabase) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured. Please verify Supabase credentials in .env.'
    });
  }

  const {
    doctor_id,
    patient_name,
    patient_email,
    patient_phone,
    appointment_date,
    appointment_time,
    notes
  } = req.body;

  // 1. Validation
  if (!doctor_id || typeof doctor_id !== 'string') {
    return res.status(400).json({ success: false, error: 'A valid doctor must be selected.' });
  }
  if (!patient_name || typeof patient_name !== 'string' || patient_name.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Patient name is required.' });
  }
  if (!patient_email || typeof patient_email !== 'string' || !patient_email.includes('@')) {
    return res.status(400).json({ success: false, error: 'A valid patient email address is required.' });
  }
  if (!appointment_date || !/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
    return res.status(400).json({ success: false, error: 'A valid appointment date (YYYY-MM-DD) is required.' });
  }
  if (!appointment_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(appointment_time)) {
    return res.status(400).json({ success: false, error: 'A valid appointment time (HH:MM) is required.' });
  }

  // Format time as HH:MM:00
  const normalizedTime = appointment_time.length === 5 ? `${appointment_time}:00` : appointment_time;

  try {
    // 2. Verify doctor exists and is active
    const { data: doctor, error: docError } = await supabase
      .from('doctors')
      .select('id, name, specialization, department, is_active')
      .eq('id', doctor_id)
      .maybeSingle();

    if (docError || !doctor) {
      return res.status(404).json({ success: false, error: 'The selected doctor was not found.' });
    }
    if (!doctor.is_active) {
      return res.status(400).json({ success: false, error: 'This doctor is currently not accepting appointments.' });
    }

    // 3. Prevent duplicate: Check existing slot before insert
    const { data: existingSlot, error: slotCheckError } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('doctor_id', doctor_id)
      .eq('appointment_date', appointment_date)
      .eq('appointment_time', normalizedTime)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (existingSlot) {
      return res.status(409).json({
        success: false,
        error: `Doctor ${doctor.name} already has an appointment booked on ${appointment_date} at ${normalizedTime.slice(0, 5)}. Please select a different time slot.`
      });
    }

    // 4. Upsert patient profile by email
    const cleanEmail = patient_email.toLowerCase().trim();
    let patientId = null;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingProfile) {
      patientId = existingProfile.id;
      // Keep name/phone updated
      await supabase
        .from('profiles')
        .update({
          full_name: patient_name.trim(),
          phone: patient_phone ? patient_phone.trim() : null
        })
        .eq('id', patientId);
    } else {
      const { data: newProfile, error: profileErr } = await supabase
        .from('profiles')
        .insert([{
          full_name: patient_name.trim(),
          email: cleanEmail,
          phone: patient_phone ? patient_phone.trim() : null
        }])
        .select('id')
        .single();

      if (profileErr) {
        return res.status(500).json({
          success: false,
          error: `Failed to create patient profile: ${profileErr.message}`
        });
      }
      patientId = newProfile.id;
    }

    // 5. Insert appointment (PostgreSQL unique constraint also defends against race conditions)
    const { data: appointment, error: insertError } = await supabase
      .from('appointments')
      .insert([{
        doctor_id,
        patient_id: patientId,
        appointment_date,
        appointment_time: normalizedTime,
        status: 'scheduled',
        notes: notes ? notes.trim() : null
      }])
      .select('id, doctor_id, patient_id, appointment_date, appointment_time, status, notes, created_at')
      .single();

    if (insertError) {
      // 23505 is PostgreSQL unique constraint violation
      if (insertError.code === '23505') {
        return res.status(409).json({
          success: false,
          error: `Duplicate booking: This doctor is already booked for ${appointment_date} at ${normalizedTime.slice(0, 5)}.`
        });
      }
      return res.status(500).json({
        success: false,
        error: `Database insertion error: ${insertError.message}`
      });
    }

    // 6. Return successful booking confirmation
    return res.status(201).json({
      success: true,
      message: 'Appointment successfully booked!',
      appointment: {
        ...appointment,
        doctor: {
          name: doctor.name,
          specialization: doctor.specialization,
          department: doctor.department
        },
        patient: {
          name: patient_name.trim(),
          email: cleanEmail
        }
      }
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Server error: ${err.message}`
    });
  }
});

// Fallback route to serve index.html for any unhandled page request
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server if run directly (local / dev mode)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MediCare Hospital server running on http://localhost:${PORT}`);
    console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
  });
}

// Export app for Vercel serverless deployment and testing
module.exports = app;
