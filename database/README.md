# Supabase Database Setup Instructions

This guide explains how to set up the MediCare Hospital PostgreSQL database schema on Supabase.

---

## Step 1: Open the Supabase Project Dashboard
1. Log in to [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Select your MediCare Hospital project.

---

## Step 2: Open the SQL Editor
1. In the left navigation sidebar, click on **SQL Editor** (icon looking like `>_` or SQL terminal).
2. Click **+ New query** (or **Create a new snippet**).

---

## Step 3: Run the Schema
1. Open [`database/schema.sql`](./schema.sql) in your code editor.
2. Copy the entire file contents.
3. Paste the SQL code into the Supabase SQL Editor.
4. Click the green **Run** button (or press `Ctrl` + `Enter` / `Cmd` + `Enter`).
5. Verify that the output status displays `Success. No rows returned` (or statements succeeded).

---

## Step 4: Verify Created Tables
In the left sidebar, click **Table Editor**:
- **`doctors`**: Should contain the 4 seeded sample doctors.
- **`profiles`**: Created and ready for patient records.
- **`appointments`**: Created with the unique constraint `unique_doctor_appointment_slot (doctor_id, appointment_date, appointment_time)`.

---

## Step 5: Copy API Credentials to `.env`
1. Go to **Project Settings** (gear icon at the bottom of the left sidebar).
2. Navigate to **API** (or **Data API** / **API Keys**):
   - **Project URL**: Copy this URL (e.g., `https://xyzproject.supabase.co`).
   - **Secret Key**: Under API Keys, look for `secret` (or `service_role`). Click **Reveal** and copy it.
     > ⚠️ **Important Security Note**: The secret/service_role key must NEVER be shared publicly or added to client-side frontend files (`public/script.js`). Keep it solely inside `.env` on your server.
3. In your local project root, open `.env` and fill in the values:
   ```env
   PORT=3000
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SECRET_KEY=your-actual-secret-key-here
   ```
4. Restart your development server (`npm run dev`) or let nodemon detect changes.
5. Verify connection by visiting `http://localhost:3000/api/health` and `http://localhost:3000/api/doctors`.
