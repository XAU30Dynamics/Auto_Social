require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Google Sheets Auth ───────────────────────────────────────────────────────
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Posts';

// Column index map (0-based)
const COL = {
  timestamp: 0,    // A
  date: 1,         // B
  day: 2,          // C
  pillar: 3,       // D
  image_url: 4,    // E
  headline: 5,     // F
  caption: 6,      // G
  hashtags: 7,     // H
  x_post: 8,       // I
  threads_post: 9, // J
  status: 10,      // K
  subheading: 11,  // L
  cta_text: 12,    // M
  bg_variant: 13,  // N
  canva_url: 14,   // O
  final_image: 15, // P
  posted_ig: 16,   // Q
  posted_x: 17,    // R
  posted_threads: 18, // S
};

// ─── GET /api/posts ───────────────────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:S`,
    });

    const rows = response.data.values || [];
    const posts = rows.map((row, index) => ({
      rowIndex: index + 2, // 1-based Sheet row (row 1 is header)
      timestamp: row[COL.timestamp] || '',
      date: row[COL.date] || '',
      day: row[COL.day] || '',
      pillar: row[COL.pillar] || '',
      image_url: row[COL.image_url] || '',
      headline: row[COL.headline] || '',
      caption: row[COL.caption] || '',
      hashtags: row[COL.hashtags] || '',
      x_post: row[COL.x_post] || '',
      threads_post: row[COL.threads_post] || '',
      status: row[COL.status] || '',
      subheading: row[COL.subheading] || '',
      cta_text: row[COL.cta_text] || '',
      bg_variant: row[COL.bg_variant] || '',
      canva_url: row[COL.canva_url] || '',
      final_image: row[COL.final_image] || '',
      posted_ig: row[COL.posted_ig] || '',
      posted_x: row[COL.posted_x] || '',
      posted_threads: row[COL.posted_threads] || '',
    }));

    // Return newest first
    res.json(posts.reverse());
  } catch (err) {
    console.error('GET /api/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/posts/:row ────────────────────────────────────────────────────
// Update any fields on a row. Body: { field: value, ... }
app.patch('/api/posts/:row', async (req, res) => {
  const rowIndex = parseInt(req.params.row);
  const updates = req.body;

  try {
    const sheets = getSheetsClient();

    // Build individual cell updates
    const data = [];
    for (const [field, value] of Object.entries(updates)) {
      if (COL[field] === undefined) continue;
      const colLetter = String.fromCharCode(65 + COL[field]);
      data.push({
        range: `${SHEET_NAME}!${colLetter}${rowIndex}`,
        values: [[value]],
      });
    }

    if (data.length === 0) return res.json({ ok: true });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/canva-autofill ─────────────────────────────────────────────────
// Triggers Canva autofill and returns the new design URL
app.post('/api/canva-autofill', async (req, res) => {
  const { rowIndex, bg_variant, headline, subheading, cta_text, caption } = req.body;

  const templateId = bg_variant === '2'
    ? process.env.CANVA_TEMPLATE_WHITE
    : process.env.CANVA_TEMPLATE_BLACK;

  // Strip hashtags from caption for the text field
  const textNoHashtags = caption.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim();

  try {
    // Canva Autofill API
    const autofillRes = await axios.post(
      `https://api.canva.com/rest/v1/autofills`,
      {
        brand_template_id: templateId,
        title: `XAU30_${Date.now()}`,
        data: {
          Heading: { type: 'text', text: headline },
          Subheading: { type: 'text', text: subheading },
          'CTA text': { type: 'text', text: cta_text },
          'Text with no hashtags': { type: 'text', text: textNoHashtags },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CANVA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Canva autofill is async — poll for completion
    const jobId = autofillRes.data.job?.id;
    if (!jobId) throw new Error('No job ID returned from Canva autofill');

    let designUrl = null;
    let attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 1500));
      const pollRes = await axios.get(
        `https://api.canva.com/rest/v1/autofills/${jobId}`,
        { headers: { Authorization: `Bearer ${process.env.CANVA_ACCESS_TOKEN}` } }
      );
      const job = pollRes.data.job;
      if (job?.status === 'success') {
        const designId = job.result?.design?.id;
        designUrl = `https://www.canva.com/design/${designId}/edit`;
        break;
      }
      if (job?.status === 'failed') throw new Error('Canva autofill job failed');
      attempts++;
    }

    if (!designUrl) throw new Error('Canva autofill timed out');

    // Write design URL to Sheet column O
    if (rowIndex) {
      const sheets = getSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!O${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[designUrl]] },
      });
    }

    res.json({ ok: true, canva_url: designUrl });
  } catch (err) {
    console.error('POST /api/canva-autofill error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message });
  }
});

// ─── Serve dashboard for all other routes ────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Auto Social dashboard running on port ${PORT}`));
