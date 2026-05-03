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

// ─── POST /api/engagement ─────────────────────────────────────────────────────
// Searches target accounts for recent posts and drafts replies using Claude
app.post('/api/engagement', async (req, res) => {
  const TAVILY_KEY = process.env.TAVILY_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!TAVILY_KEY) return res.status(500).json({ error: 'TAVILY_API_KEY not set' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  // Target accounts from brief Section 9
  const targets = [
    { handle: '@FTMO_com',        platform: 'X',         query: 'from:FTMO_com trading prop firm' },
    { handle: '@cTrader',         platform: 'X',         query: 'from:cTrader algo trading platform' },
    { handle: '@cTraderGuru',     platform: 'X',         query: 'from:cTraderGuru cTrader algo' },
    { handle: '@PropFirmMatch',   platform: 'X',         query: 'from:PropFirmMatch prop firm' },
    { handle: '@AlgobuilderX',    platform: 'X',         query: 'from:AlgobuilderX algo builder' },
    { handle: '@ftmocom',         platform: 'Instagram', query: 'ftmocom FTMO prop firm trading site:twitter.com OR site:x.com' },
    { handle: '@ctrader',         platform: 'Instagram', query: 'ctrader official trading platform news' },
  ];

  const results = [];

  for (const target of targets) {
    try {
      // Search for recent posts from this account
      const tavilyRes = await axios.post(
        'https://api.tavily.com/search',
        {
          query: target.query,
          search_depth: 'basic',
          max_results: 2,
          include_answer: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${TAVILY_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const searchResults = tavilyRes.data.results || [];
      if (searchResults.length === 0) continue;

      // Take the most relevant result
      const post = searchResults[0];
      const postContent = post.content || post.title || '';
      const postUrl = post.url || '';

      if (!postContent || postContent.length < 20) continue;

      // Draft a reply using Claude
      const claudeRes = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: `You are drafting a reply on behalf of TraderS from XAU30 Dynamics — a serious, experienced XAUUSD trader and algo developer (13 years trading, 35+ prop firm payouts, 18 FTMO payouts).

Voice rules:
- Direct, evidence-led, anti-hype
- Add genuine value — share a specific insight, data point, or experience
- Never plug XAU30 Dynamics or ask people to follow/join
- No emojis, no trader-bro slang, no sycophancy
- Sound like a knowledgeable practitioner, not a marketer
- Max 240 characters for X, 3 sentences max
- If you disagree with something in the post, disagree respectfully with reasoning

Post from ${target.handle} (${target.platform}):
"${postContent.slice(0, 500)}"

Draft a reply that adds genuine value. Return ONLY the reply text, nothing else.`,
            },
          ],
        },
        {
          headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      );

      const reply = claudeRes.data.content?.[0]?.text?.trim() || '';
      if (!reply) continue;

      results.push({
        handle: target.handle,
        platform: target.platform,
        post_snippet: postContent.slice(0, 200),
        post_url: postUrl,
        drafted_reply: reply,
      });

    } catch (err) {
      console.error(`Engagement search error for ${target.handle}:`, err.response?.data || err.message);
      // Continue to next target rather than failing entirely
    }
  }

  res.json({ results, generated_at: new Date().toISOString() });
});

// ─── Serve dashboard ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Auto Social dashboard running on port ${PORT}`));
