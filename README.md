# OpenAI Batch Dashboard

A self-hosted Next.js dashboard for monitoring and managing OpenAI Batch API jobs and file storage. Built with a Supabase-inspired dark UI.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![React](https://img.shields.io/badge/React-19-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4)

## Features

**Batches**
- List all batches with live status, progress bars, token usage, and estimated cost
- Search across all batches by ID, status, endpoint, or metadata
- Expand metadata tags inline per row
- Cancel running batches (individually or all at once)
- Restart completed/failed/expired batches (re-submits the same input file)
- View per-batch detail: request counts, token usage, cost breakdown, timeline, files
- Browse batch responses with pagination — conversation view (input + assistant output) and raw JSON
- Lazy-loads up to 5,000 batches with background pagination; session-cached to avoid re-fetching

**Storage**
- List all uploaded files with filename, purpose, size, and creation date
- Search by filename, file ID, or purpose
- Select and download files (triggers browser downloads)
- Lazy-loads up to 500 files with background pagination

**Cost Estimation**
- Estimates batch cost for 30+ models (GPT-5.x, GPT-4.x, o-series, GPT-3.5) using Batch API pricing
- Breaks down input, cached input, and output costs separately

**UI**
- Dark-mode-only, Supabase-inspired design system
- Fully mobile-responsive: collapsible sidebar drawer, horizontal-scrolling tables, stacking layouts

## Setup

**Prerequisites:** Node.js 18+, an OpenAI API key.

```bash
git clone <repo>
cd openai-batch-dashboard
npm install
```

Copy the env example and add your key:

```bash
cp .env.local.example .env.local
# edit .env.local
OPENAI_API_KEY=sk-...
```

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve production build
```

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Icons | lucide-react |
| OpenAI | openai SDK v6 |
| Markdown | react-markdown + remark-gfm |
| Styling util | clsx + tailwind-merge + CVA |

## Project Structure

```
src/
  app/
    batches/
      page.tsx               # Batches list page
      batches-client.tsx     # Full list UI: table, search, pagination, modals
      [id]/
        page.tsx             # Batch detail page (direct URL)
        batch-detail.tsx     # Detail UI: tabs, timeline, responses table
    storage/
      page.tsx               # Storage page
      storage-client.tsx     # File list UI
    api/
      batches/               # List, get, cancel, restart batch endpoints
      files/                 # List, download file endpoints
      responses/             # Response input_items endpoint
  components/
    layout-shell.tsx         # Client wrapper — owns mobile drawer state
    sidebar.tsx              # Nav sidebar (drawer on mobile, static on desktop)
    mobile-topbar.tsx        # Mobile-only top bar with hamburger
    page-header.tsx          # Shared page header
    response-modal.tsx       # Per-response conversation + raw JSON modal
    ui/button.tsx            # CVA button component
    ui/badge.tsx             # Status/purpose badge
  lib/
    pricing.ts               # Batch API cost estimation
    utils.ts                 # cn(), formatRelative(), formatBytes(), formatDate()
```

## API Routes

All routes proxy to the OpenAI API using the `OPENAI_API_KEY` env var.

| Route | Method | Description |
|---|---|---|
| `/api/batches` | GET | List batches (`limit`, `after` cursor) |
| `/api/batches/[id]` | GET | Get single batch |
| `/api/batches/cancel` | POST | Cancel one or more batches by ID |
| `/api/batches/restart` | POST | Clone and re-submit batches by ID |
| `/api/files` | GET | List files (`limit`, `after` cursor) |
| `/api/files/download` | GET | Stream file content as download |
| `/api/responses/[id]/input_items` | GET | Fetch response input items |

## Notes

- All data is fetched client-side on page load and cached in `sessionStorage`. Refresh clears the cache.
- Batches auto-poll for new items every 30 seconds.
- Cost estimates use Batch API rates (50% discount vs. standard API) and are approximations.
- The TypeScript strict build has one pre-existing error in `storage-client.tsx` (implicit `any` on a fetch variable) that does not affect runtime behavior.
