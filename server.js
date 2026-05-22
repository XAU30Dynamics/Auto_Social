require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
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
  timestamp: 0,       // A
  date: 1,            // B
  day: 2,             // C
  pillar: 3,          // D
  image_url: 4,       // E
  headline: 5,        // F
  caption: 6,         // G
  hashtags: 7,        // H
  x_post: 8,          // I
  threads_post: 9,    // J
  status: 10,         // K
  subheading: 11,     // L
  cta_text: 12,       // M
  bg_variant: 13,     // N
  canva_url: 14,      // O
  final_image: 15,    // P
  posted_ig: 16,      // Q
  posted_x: 17,       // R
  posted_threads: 18, // S
  graphic_text: 19,   // T
};

// ─── GET /api/posts ───────────────────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:T`,
    });

    const rows = response.data.values || [];
    const posts = rows.map((row, index) => {
      const caption = row[COL.caption] || '';
      const hashtags = row[COL.hashtags] || '';
      // Merge caption + hashtags for the dashboard — single block, ready to copy
      const captionWithHashtags = hashtags
        ? `${caption}\n\n${hashtags}`
        : caption;

      return {
        rowIndex: index + 2,
        timestamp: row[COL.timestamp] || '',
        date: row[COL.date] || '',
        day: row[COL.day] || '',
        pillar: row[COL.pillar] || '',
        image_url: row[COL.image_url] || '',
        headline: row[COL.headline] || '',
        caption: captionWithHashtags,
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
        graphic_text: row[COL.graphic_text] || '',
      };
    });

    res.json(posts.reverse());
  } catch (err) {
    console.error('GET /api/posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/posts/:row ────────────────────────────────────────────────────
app.patch('/api/posts/:row', async (req, res) => {
  const rowIndex = parseInt(req.params.row);
  const updates = req.body;

  try {
    const sheets = getSheetsClient();
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

// ─── Serve dashboard ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Auto Social dashboard running on port ${PORT}`));
