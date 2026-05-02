# XAU30 Dynamics — Auto Social Dashboard

Mobile-first approval dashboard for the XAU30 social media automation pipeline.

## Stack
- Node.js / Express backend
- Vanilla HTML/CSS/JS frontend (no framework, works as iOS home screen app)
- Google Sheets API (reads/writes the Posts sheet)
- Canva Autofill API (generates branded graphics from templates)

## Setup

### 1. Environment variables
Copy `.env.example` to `.env` and fill in:

**Google Sheets**
- Create a Google Cloud service account with Sheets API access
- Share the spreadsheet with the service account email
- Paste the `client_email` and `private_key` from the service account JSON

**Canva API**
- Go to https://www.canva.com/developers
- Create an integration, get your `client_id` and `client_secret`
- Complete OAuth to get an `access_token`
- The two brand template IDs are already set in `.env.example`

### 2. Install & run locally
```bash
npm install
npm run dev
```

### 3. Deploy to Railway
- Connect this repo to a Railway project
- Add all environment variables in Railway's Variables tab
- Railway auto-deploys on push to main

### 4. iOS home screen
- Open the Railway URL in Safari on your iPhone
- Tap Share → Add to Home Screen
- Name it "Auto Social" — it will open full-screen like a native app

## Dashboard features
- View all posts, newest first
- Filter by status (Pending / Approved / Rejected)
- Edit headline, subheading, CTA, caption, hashtags, X post, Threads post inline
- Character counters per platform (IG 2200, X 280, Threads 500)
- Pick black or white Canva template per post
- Generate Canva graphic → opens directly in Canva app to swap chart image
- One-tap copy per platform (IG caption+hashtags merged, X, Threads)
- Approve / Reject / Save buttons
- Mark posted per platform (IG / X / Threads)

## Column map (Google Sheet — Posts tab)
| Col | Field |
|-----|-------|
| A | timestamp |
| B | date |
| C | day |
| D | pillar |
| E | image_url |
| F | headline |
| G | caption |
| H | hashtags |
| I | x_post |
| J | threads_post |
| K | status |
| L | subheading |
| M | cta_text |
| N | bg_variant |
| O | canva_design_url |
| P | final_image_url |
| Q | posted_ig |
| R | posted_x |
| S | posted_threads |
