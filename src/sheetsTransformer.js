/**
 * Sheets Transformer
 * Converts parsed resume JSON → 15-column Google Sheets row
 */

// ─── Degree Ranking ──────────────────────────────────────────────────────────
const DEGREE_RANK = {
  'phd': 7, 'ph.d': 7, 'doctorate': 7,
  'master': 6, 'm.tech': 6, 'm.sc': 6, 'm.s': 6, 'mba': 6,
  'm.eng': 6, 'm.e': 6, 'm.com': 6, 'm.a': 6,
  'bachelor': 5, 'b.tech': 5, 'b.sc': 5, 'b.s': 5,
  'b.eng': 5, 'b.e': 5, 'b.com': 5, 'b.a': 5,
  'associate': 3, 'diploma': 3,
  '12th': 2, 'hsc': 2, 'intermediate': 2,
  '10th': 1, 'ssc': 1,
};

function getDegreeRank(degree) {
  if (!degree || degree === 'NULL') return 0;
  const lower = degree.toLowerCase();
  for (const [key, rank] of Object.entries(DEGREE_RANK)) {
    if (lower.includes(key)) return rank;
  }
  return 0;
}

function getHighestDegree(education) {
  if (!education || !education.length) return null;
  return education.reduce((best, curr) => {
    return getDegreeRank(curr.Degree) >= getDegreeRank(best?.Degree) ? curr : best;
  }, education[0]);
}

// ─── Date Parsing ────────────────────────────────────────────────────────────
function parseDate(dateStr) {
  if (!dateStr || dateStr === 'NULL') return null;
  if (dateStr === 'Present') return new Date();

  // YYYY-MM
  const ym = dateStr.match(/^(\d{4})-(\d{2})$/);
  if (ym) return new Date(parseInt(ym[1]), parseInt(ym[2]) - 1);

  // Just YYYY
  const y = dateStr.match(/^(\d{4})$/);
  if (y) return new Date(parseInt(y[1]), 0);

  return null;
}

// ─── Experience Calculation ──────────────────────────────────────────────────
function calculateTotalExperience(workExp) {
  if (!workExp || !workExp.length) return 'NULL';

  let totalMonths = 0;
  const now = new Date();

  for (const job of workExp) {
    const start = parseDate(job.Start_Date);
    const end = (job.End_Date === 'Present' || !job.End_Date) ? now : parseDate(job.End_Date);
    if (!start || !end) continue;
    const months = (end.getFullYear() - start.getFullYear()) * 12
                 + (end.getMonth() - start.getMonth());
    if (months > 0) totalMonths += months;
  }

  if (totalMonths === 0) return 'NULL';
  const years = Math.round((totalMonths / 12) * 10) / 10;
  return String(years);
}

// ─── Most Recent Job ─────────────────────────────────────────────────────────
function getMostRecentJob(workExp) {
  if (!workExp || !workExp.length) return null;

  // Present jobs take priority
  const activeJobs = workExp.filter(j => j.End_Date === 'Present');
  if (activeJobs.length) {
    // Among those, pick the one with the latest start date
    return activeJobs.reduce((latest, curr) => {
      const d1 = parseDate(curr.Start_Date);
      const d2 = parseDate(latest.Start_Date);
      if (!d1) return latest;
      if (!d2) return curr;
      return d1 > d2 ? curr : latest;
    }, activeJobs[0]);
  }

  // Otherwise pick the one with the latest end date
  return workExp.reduce((latest, curr) => {
    const d1 = parseDate(curr.End_Date);
    const d2 = parseDate(latest.End_Date);
    if (!d1) return latest;
    if (!d2) return curr;
    return d1 > d2 ? curr : latest;
  }, workExp[0]);
}

// ─── Safe CSV value (escape commas, quotes, newlines) ────────────────────────
function safe(val) {
  if (val === null || val === undefined || val === 'NULL' || val === '') return 'NULL';
  const str = String(val).trim();
  // If value contains comma, quote, or newline → wrap in double quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── Main Transformer ────────────────────────────────────────────────────────

/**
 * Returns a plain object with all 15 columns
 */
export function transformToSheetsObject(data) {
  const highest   = getHighestDegree(data.Education || []);
  const currentJob = getMostRecentJob(data.Work_Experience || []);
  const totalExp  = calculateTotalExperience(data.Work_Experience || []);
  const skills    = (data.Skills || []).filter(s => s && s !== 'NULL').join(';');

  return {
    Full_Name:             safe(data.Full_Name),
    Email:                 safe(data.Email),
    Phone_Number:          safe(data.Phone_Number),
    Location:              safe(data.Location),
    LinkedIn:              safe(data.LinkedIn),
    GitHub_or_Portfolio:   safe(data.GitHub_or_Portfolio),
    Highest_Degree:        safe(highest?.Degree),
    Field_of_Study:        safe(highest?.Field_of_Study),
    University:            safe(highest?.Institution),
    Total_Experience:      totalExp,
    Current_Company:       safe(currentJob?.Company),
    Current_Role:          safe(currentJob?.Job_Title),
    Skills:                skills || 'NULL',
    Projects_Count:        String((data.Projects || []).length),
    Certifications_Count:  String((data.Certifications || []).length),
  };
}

/**
 * Returns a single comma-separated CSV row string
 */
export function transformToSheetsRow(data) {
  const obj = transformToSheetsObject(data);
  return Object.values(obj).join(',');
}

/**
 * Column display labels for the preview table
 */
export const COLUMN_LABELS = [
  { key: 'Full_Name',           label: 'Full Name' },
  { key: 'Email',               label: 'Email' },
  { key: 'Phone_Number',        label: 'Phone' },
  { key: 'Location',            label: 'Location' },
  { key: 'LinkedIn',            label: 'LinkedIn' },
  { key: 'GitHub_or_Portfolio', label: 'GitHub / Portfolio' },
  { key: 'Highest_Degree',      label: 'Highest Degree' },
  { key: 'Field_of_Study',      label: 'Field of Study' },
  { key: 'University',          label: 'University' },
  { key: 'Total_Experience',    label: 'Total Exp (yrs)' },
  { key: 'Current_Company',     label: 'Current Company' },
  { key: 'Current_Role',        label: 'Current Role' },
  { key: 'Skills',              label: 'Skills' },
  { key: 'Projects_Count',      label: 'Projects Count' },
  { key: 'Certifications_Count',label: 'Certs Count' },
];

/**
 * POST the row to the Google Apps Script web app
 */
export async function sendToGoogleSheets(rowData) {
  const SHEETS_URL =
    'https://script.google.com/macros/s/AKfycbw_mDZ05HAvKyj8ATokRIKPUBffCKTXVySUt3t0VcWw6pqTJ4Laxdn0zBx_CVm4aVlVJw/exec';

  const response = await fetch(SHEETS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(rowData),
    // Google Apps Script requires 'no-cors' when called from browser
    // We use 'no-cors' and treat any network success as sent
    mode: 'no-cors',
  });

  // With 'no-cors' the response type is 'opaque' — we can't read the body
  // but if the fetch didn't throw, the request was dispatched successfully
  return true;
}
