document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const statusBadge = document.getElementById('status-badge');
  const healthOutput = document.getElementById('health-output');
  const lastUpdated = document.getElementById('last-updated');
  const btnCheckApi = document.getElementById('btn-check-api');

  const doctorsContainer = document.getElementById('doctors-container');
  const doctorSelect = document.getElementById('doctor-select');
  const appointmentDate = document.getElementById('appointment-date');
  const appointmentTime = document.getElementById('appointment-time');
  const slotFeedback = document.getElementById('slot-feedback');

  const appointmentForm = document.getElementById('appointment-form');
  const bookingAlert = document.getElementById('booking-alert');
  const submitBookingBtn = document.getElementById('submit-booking-btn');

  const appointmentsContainer = document.getElementById('appointments-container');
  const btnRefreshAppointments = document.getElementById('btn-refresh-appointments');

  // Cache of loaded doctors
  let loadedDoctors = [];

  // Set minimum booking date to today
  if (appointmentDate) {
    const today = new Date().toISOString().split('T')[0];
    appointmentDate.min = today;
  }

  // ----------------------------------------------------
  // 1. Health Diagnostics
  // ----------------------------------------------------
  async function checkHealth() {
    statusBadge.textContent = 'Checking...';
    statusBadge.className = 'status-indicator loading';
    healthOutput.textContent = 'Fetching /api/health...';

    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      healthOutput.textContent = JSON.stringify(data, null, 2);

      if (data.database && data.database.connected) {
        statusBadge.textContent = 'All Systems Online';
        statusBadge.className = 'status-indicator online';
      } else if (data.database && data.database.status === 'unconfigured') {
        statusBadge.textContent = 'Server Online (DB Unconfigured)';
        statusBadge.className = 'status-indicator loading';
      } else {
        statusBadge.textContent = 'Server Online (DB Issue)';
        statusBadge.className = 'status-indicator error';
      }

      lastUpdated.textContent = `Last checked: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      healthOutput.textContent = `Error: ${error.message}`;
      statusBadge.textContent = 'Backend Offline';
      statusBadge.className = 'status-indicator error';
      lastUpdated.textContent = `Last checked: ${new Date().toLocaleTimeString()}`;
    }
  }

  // ----------------------------------------------------
  // 2. Load Doctors
  // ----------------------------------------------------
  async function loadDoctors() {
    if (!doctorsContainer) return;

    try {
      const response = await fetch('/api/doctors');
      const result = await response.json();

      if (!response.ok || !result.success) {
        doctorsContainer.innerHTML = `
          <div class="info-card">
            <p><strong>Could not load doctors</strong></p>
            <p style="margin-top: 6px;">${escapeHtml(result.error || 'Check database configuration.')}</p>
          </div>
        `;
        return;
      }

      loadedDoctors = result.data || [];

      if (loadedDoctors.length === 0) {
        doctorsContainer.innerHTML = `
          <div class="info-card">
            <p>No active doctors found in the database.</p>
          </div>
        `;
        return;
      }

      // Populate Doctors Grid
      doctorsContainer.innerHTML = loadedDoctors.map(doc => `
        <div class="doctor-card" data-doctor-id="${doc.id}">
          <h3>${escapeHtml(doc.name)}</h3>
          <div class="doctor-specialty">${escapeHtml(doc.specialization)}</div>
          <div class="doctor-department">${escapeHtml(doc.department)}</div>
          <div class="doctor-meta">
            <span>Fee: $${parseFloat(doc.consultation_fee || 0).toFixed(2)}</span>
            <span>${doc.available_days ? doc.available_days.length + ' days/wk' : 'Mon-Fri'}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-sm btn-book-doctor" data-id="${doc.id}">
            Book with ${escapeHtml(doc.name.split(' ')[1] || doc.name)} &rarr;
          </button>
        </div>
      `).join('');

      // Populate Doctor Dropdown
      if (doctorSelect) {
        doctorSelect.innerHTML = '<option value="">-- Choose a Doctor --</option>' +
          loadedDoctors.map(doc => `
            <option value="${doc.id}">${escapeHtml(doc.name)} (${escapeHtml(doc.specialization)})</option>
          `).join('');
      }

      // Add click handlers on doctor cards
      document.querySelectorAll('.btn-book-doctor').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const docId = e.currentTarget.getAttribute('data-id');
          if (doctorSelect) {
            doctorSelect.value = docId;
            checkSlotAvailability();
          }
          const bookingSec = document.getElementById('booking');
          if (bookingSec) {
            bookingSec.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });

    } catch (err) {
      doctorsContainer.innerHTML = `
        <div class="info-card">
          <p><strong>Failed to connect to backend</strong>: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  // ----------------------------------------------------
  // 3. Slot Availability Checking
  // ----------------------------------------------------
  async function checkSlotAvailability() {
    if (!doctorSelect || !appointmentDate || !appointmentTime) return;

    const docId = doctorSelect.value;
    const dateVal = appointmentDate.value;

    // Reset slot options
    Array.from(appointmentTime.options).forEach(opt => {
      if (opt.value) {
        opt.disabled = false;
        opt.textContent = opt.textContent.replace(' (Booked)', '');
      }
    });

    if (!docId || !dateVal) {
      slotFeedback.textContent = 'Choose doctor and date to verify slot availability.';
      slotFeedback.className = 'form-hint';
      return;
    }

    slotFeedback.textContent = 'Checking slot availability...';
    slotFeedback.className = 'form-hint';

    try {
      const response = await fetch(`/api/appointments/booked-slots?doctor_id=${encodeURIComponent(docId)}&date=${encodeURIComponent(dateVal)}`);
      const result = await response.json();

      if (response.ok && result.success) {
        const booked = result.bookedSlots || [];
        let bookedCount = 0;

        Array.from(appointmentTime.options).forEach(opt => {
          if (opt.value && booked.includes(opt.value)) {
            opt.disabled = true;
            if (!opt.textContent.includes('(Booked)')) {
              opt.textContent += ' (Booked)';
            }
            bookedCount++;
            if (appointmentTime.value === opt.value) {
              appointmentTime.value = '';
            }
          }
        });

        if (bookedCount > 0) {
          slotFeedback.textContent = `${bookedCount} slot(s) already booked for this doctor on ${dateVal}.`;
          slotFeedback.className = 'form-hint warning';
        } else {
          slotFeedback.textContent = `All slots are currently open for this date.`;
          slotFeedback.className = 'form-hint';
        }
      }
    } catch (err) {
      slotFeedback.textContent = 'Could not verify slot availability.';
    }
  }

  if (doctorSelect) doctorSelect.addEventListener('change', checkSlotAvailability);
  if (appointmentDate) appointmentDate.addEventListener('change', checkSlotAvailability);

  // ----------------------------------------------------
  // 4. Handle Appointment Booking
  // ----------------------------------------------------
  if (appointmentForm) {
    appointmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const doctorId = doctorSelect.value;
      const dateVal = appointmentDate.value;
      const timeVal = appointmentTime.value;
      const patientName = document.getElementById('patient-name').value.trim();
      const patientEmail = document.getElementById('patient-email').value.trim();
      const patientPhone = document.getElementById('patient-phone').value.trim();
      const notes = document.getElementById('appointment-notes').value.trim();

      if (!doctorId || !dateVal || !timeVal || !patientName || !patientEmail) {
        showAlert('Please fill in all required fields.', 'danger');
        return;
      }

      submitBookingBtn.disabled = true;
      submitBookingBtn.textContent = 'Scheduling Appointment...';

      try {
        const response = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctor_id: doctorId,
            appointment_date: dateVal,
            appointment_time: timeVal,
            patient_name: patientName,
            patient_email: patientEmail,
            patient_phone: patientPhone || null,
            notes: notes || null
          })
        });

        const result = await response.json();

        if (response.status === 201 && result.success) {
          showAlert(`
            <strong>Appointment Confirmed!</strong><br>
            Doctor: ${escapeHtml(result.appointment.doctor.name)} (${escapeHtml(result.appointment.doctor.specialization)})<br>
            Date &amp; Time: ${result.appointment.appointment_date} at ${result.appointment.appointment_time.slice(0, 5)}<br>
            Patient: ${escapeHtml(result.appointment.patient.name)} (${escapeHtml(result.appointment.patient.email)})
          `, 'success');

          // Reset form fields
          appointmentForm.reset();
          if (appointmentDate) {
            appointmentDate.min = new Date().toISOString().split('T')[0];
          }

          // Refresh live lists
          checkSlotAvailability();
          loadAppointments();
        } else if (response.status === 409) {
          // Duplicate booking conflict
          showAlert(`<strong>Slot Conflict:</strong> ${escapeHtml(result.error)}`, 'danger');
          checkSlotAvailability();
        } else {
          showAlert(`<strong>Booking Failed:</strong> ${escapeHtml(result.error || 'Unknown error occurred.')}`, 'danger');
        }
      } catch (err) {
        showAlert(`<strong>Network Error:</strong> ${escapeHtml(err.message)}`, 'danger');
      } finally {
        submitBookingBtn.disabled = false;
        submitBookingBtn.textContent = 'Confirm & Schedule Appointment';
      }
    });
  }

  function showAlert(html, type) {
    if (!bookingAlert) return;
    bookingAlert.className = `alert alert-${type}`;
    bookingAlert.innerHTML = html;
  }

  function hideAlert() {
    if (!bookingAlert) return;
    bookingAlert.className = 'alert hidden';
    bookingAlert.innerHTML = '';
  }

  // ----------------------------------------------------
  // 5. Load Scheduled Appointments
  // ----------------------------------------------------
  async function loadAppointments() {
    if (!appointmentsContainer) return;

    try {
      const response = await fetch('/api/appointments');
      const result = await response.json();

      if (!response.ok || !result.success) {
        appointmentsContainer.innerHTML = `
          <p class="placeholder-text">Could not load scheduled appointments: ${escapeHtml(result.error || '')}</p>
        `;
        return;
      }

      const list = result.data || [];
      if (list.length === 0) {
        appointmentsContainer.innerHTML = `
          <p class="placeholder-text">No scheduled appointments found yet. Use the booking form above to book your first appointment!</p>
        `;
        return;
      }

      appointmentsContainer.innerHTML = list.map(item => {
        const docName = item.doctors ? item.doctors.name : 'Medical Staff';
        const docSpec = item.doctors ? item.doctors.specialization : '';
        const patientName = item.profiles ? item.profiles.full_name : 'Patient';
        const patientEmail = item.profiles ? item.profiles.email : '';
        const timeDisplay = item.appointment_time ? item.appointment_time.slice(0, 5) : '';

        return `
          <div class="appointment-item">
            <div class="appointment-info">
              <h4>${escapeHtml(docName)} <span style="font-weight: 400; font-size: 0.9rem; color: #0284c7;">(${escapeHtml(docSpec)})</span></h4>
              <p>Patient: <strong>${escapeHtml(patientName)}</strong> &bull; ${escapeHtml(patientEmail)}</p>
              ${item.notes ? `<p style="font-style: italic; margin-top: 2px;">Note: "${escapeHtml(item.notes)}"</p>` : ''}
            </div>
            <div>
              <span class="appointment-time-badge">&#128197; ${item.appointment_date} &bull; ${timeDisplay}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      appointmentsContainer.innerHTML = `
        <p class="placeholder-text">Error fetching appointments: ${escapeHtml(err.message)}</p>
      `;
    }
  }

  if (btnRefreshAppointments) {
    btnRefreshAppointments.addEventListener('click', loadAppointments);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ----------------------------------------------------
  // Initial Page Executions
  // ----------------------------------------------------
  checkHealth();
  loadDoctors();
  loadAppointments();

  if (btnCheckApi) {
    btnCheckApi.addEventListener('click', () => {
      checkHealth();
      loadDoctors();
      loadAppointments();
    });
  }
});
