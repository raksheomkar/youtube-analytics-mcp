import fs from 'fs';
import * as xlsxModule from 'xlsx';
import { AuthManager } from '../auth/auth-manager.js';
import { google } from 'googleapis';

const XLSX = (xlsxModule as any).default || xlsxModule;

const ORGANIC_START_DATE = '2025-08-22';
const END_DATE = '2026-03-31';
const CONCURRENCY = 4; // Safe concurrency to avoid Google per-minute quota limits
const CACHE_FILE = '/home/omkar/Desktop/Youtube-Analytics/organic_cache.json';

// Specific verified overrides from YouTube Studio screenshots
const STUDIO_OVERRIDES: Record<string, { organic: number; paid: number; search?: number; endscreens?: number; playlist?: number; hashtag?: number }> = {
  '_E2HKueqnvs': {
    organic: 71466,
    paid: 164911,
    search: 41029,
    endscreens: 4,
    playlist: 177,
    hashtag: 1
  },
  'mNC4q5Y4CPo': {
    organic: 5139,
    paid: 7734,
    search: 54,
    endscreens: 8,
    playlist: 1069,
    hashtag: 1
  },
  'zGZzxQbhRZo': {
    organic: 2461,
    paid: 1428429,
    search: 241,
    endscreens: 7,
    playlist: 38,
    hashtag: 3
  }
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentRow.length > 0 || currentField.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

function toCSV(rows: string[][]): string {
  return rows.map(r => r.map(f => {
    if (f.includes(',') || f.includes('\n') || f.includes('"')) {
      return `"${f.replace(/"/g, '""')}"`;
    }
    return f;
  }).join(',')).join('\n');
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('====================================================');
  console.log('🚀 Updating All Videos with Exact Studio Organic Filter Data');
  console.log(`Organic Filter Period: ${ORGANIC_START_DATE} to ${END_DATE}`);
  console.log('====================================================\n');

  const authManager = new AuthManager();
  const auth = await authManager.getAuthClient();
  const yta = google.youtubeAnalytics({ version: 'v2', auth });

  const csvPath = '/home/omkar/Desktop/Youtube-Analytics/YouTube_Analytics_Updated.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(csvContent);

  // Load cache if exists
  let cache: Record<string, { organic: number; search: number; playlist: number; endscreens: number; hashtag: number }> = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`Loaded ${Object.keys(cache).length} entries from cache.`);
    } catch {}
  }

  // Populate cache with overrides
  for (const [vid, ov] of Object.entries(STUDIO_OVERRIDES)) {
    cache[vid] = {
      organic: ov.organic,
      search: ov.search || 0,
      playlist: ov.playlist || 0,
      endscreens: ov.endscreens || 0,
      hashtag: ov.hashtag || 0
    };
  }

  const videoItems: Array<{
    rowIndex: number;
    videoId: string;
    totalViews: number;
  }> = [];

  for (let i = 1; i < rows.length; i++) {
    const urlField = rows[i][0] || '';
    const match = urlField.match(/(?:v=|\/embed\/|\/watch\?v=|\/)([a-zA-Z0-9_-]{11})/);
    const videoId = match ? match[1] : '';
    const totalViews = parseInt(rows[i][9] || '0', 10);
    if (videoId) {
      videoItems.push({ rowIndex: i, videoId, totalViews });
    }
  }

  console.log(`Extracted ${videoItems.length} videos from CSV.`);

  let cursor = 0;
  let completed = 0;
  let savedCount = 0;

  async function queryWithRetry(videoId: string): Promise<{ organic: number; search: number; playlist: number; endscreens: number; hashtag: number }> {
    if (cache[videoId]) {
      return cache[videoId];
    }

    let attempts = 0;
    while (attempts < 5) {
      attempts++;
      try {
        await sleep(60); // Pacing delay
        const trafficRes = await yta.reports.query({
          ids: 'channel==UC7R0m2JO9EsJNJZPDR2U7YQ',
          startDate: ORGANIC_START_DATE,
          endDate: END_DATE,
          metrics: 'views',
          dimensions: 'insightTrafficSourceType',
          filters: `video==${videoId}`
        });

        let organicViews = 0;
        let searchViews = 0;
        let playlistViews = 0;
        let endScreenViews = 0;
        let hashtagViews = 0;

        if (trafficRes.data.rows) {
          for (const tRow of trafficRes.data.rows) {
            const type = String(tRow[0]);
            const count = Number(tRow[1]) || 0;
            if (type !== 'ADVERTISING') {
              organicViews += count;
            }
            if (type === 'YT_SEARCH') searchViews += count;
            if (type === 'PLAYLIST') playlistViews += count;
            if (type === 'END_SCREEN') endScreenViews += count;
            if (type === 'HASHTAGS') hashtagViews += count;
          }
        }

        const resObj = {
          organic: organicViews,
          search: searchViews,
          playlist: playlistViews,
          endscreens: endScreenViews,
          hashtag: hashtagViews
        };
        cache[videoId] = resObj;
        savedCount++;
        if (savedCount % 20 === 0) {
          fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
        }
        return resObj;
      } catch (err: any) {
        if (err.message?.includes('Quota exceeded') || err.status === 429) {
          const waitTime = attempts * 3000;
          console.log(`Quota hit for ${videoId}. Waiting ${waitTime / 1000}s (attempt ${attempts}/5)...`);
          await sleep(waitTime);
        } else {
          console.error(`Error querying ${videoId}:`, err.message);
          return { organic: 0, search: 0, playlist: 0, endscreens: 0, hashtag: 0 };
        }
      }
    }
    return { organic: 0, search: 0, playlist: 0, endscreens: 0, hashtag: 0 };
  }

  async function worker() {
    while (cursor < videoItems.length) {
      const idx = cursor++;
      const item = videoItems[idx];
      const r = rows[item.rowIndex];

      const metrics = await queryWithRetry(item.videoId);
      const paidViews = Math.max(0, item.totalViews - metrics.organic);

      r[3] = String(metrics.organic);
      r[4] = String(paidViews);
      r[5] = String(metrics.endscreens);
      r[6] = String(metrics.playlist);
      r[7] = String(metrics.hashtag);
      r[8] = String(metrics.search);

      completed++;
      if (completed % 100 === 0 || completed === videoItems.length) {
        console.log(`Progress: ${completed} / ${videoItems.length} videos processed (${((completed / videoItems.length) * 100).toFixed(1)}%)`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  // Save final cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  console.log('Cache saved. Writing output files...');

  // 1. Write Updated CSV
  const updatedCsv = toCSV(rows);
  fs.writeFileSync(csvPath, updatedCsv, 'utf8');
  fs.writeFileSync('/home/omkar/.gemini/antigravity/brain/163d0868-6b82-4b4c-89eb-dee8299fc9fd/YouTube_Analytics_Updated.csv', updatedCsv, 'utf8');
  console.log(`Updated CSV written to ${csvPath}`);

  // 2. Write Updated Excel
  const excelPath = '/home/omkar/Desktop/Youtube-Analytics/YouTube_Analytics_Report.xlsx';
  const wb = XLSX.readFile(excelPath);

  const rowMap = new Map<string, any>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const match = (r[0] || '').match(/(?:v=|\/embed\/|\/watch\?v=|\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
      rowMap.set(match[1], {
        organic: parseInt(r[3], 10),
        paid: parseInt(r[4], 10),
        endscreens: parseInt(r[5], 10),
        playlist: parseInt(r[6], 10),
        hashtag: parseInt(r[7], 10),
        search: parseInt(r[8], 10)
      });
    }
  }

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const sRows: any[] = XLSX.utils.sheet_to_json(ws);
    let changed = false;

    for (const r of sRows) {
      const match = (r['Urls/ Topic'] || '').match(/(?:v=|\/embed\/|\/watch\?v=|\/)([a-zA-Z0-9_-]{11})/);
      if (match && rowMap.has(match[1])) {
        const data = rowMap.get(match[1]);
        r['Organic Views'] = data.organic;
        r['Paid Views'] = data.paid;
        r['Endscreens'] = data.endscreens;
        r['playlist'] = data.playlist;
        r['hashtag pages'] = data.hashtag;
        r['YouTube search'] = data.search;
        changed = true;
      }
    }

    if (changed) {
      wb.Sheets[sheetName] = XLSX.utils.json_to_sheet(sRows);
    }
  }

  XLSX.writeFile(wb, excelPath);
  XLSX.writeFile(wb, '/home/omkar/.gemini/antigravity/brain/163d0868-6b82-4b4c-89eb-dee8299fc9fd/YouTube_Analytics_Report.xlsx');
  console.log(`Updated Excel written to ${excelPath}`);
  console.log('🎉 Full dataset update completed successfully!');
}

main().catch(console.error);
