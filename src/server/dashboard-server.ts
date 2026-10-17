import http from 'http';
import url from 'url';
import path from 'path';
import { promises as fs } from 'fs';
import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import { AuthManager } from '../auth/auth-manager.js';

const PORT = 3000;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UC7R0m2JO9EsJNJZPDR2U7YQ';
const START_DATE = process.env.START_DATE || '2024-04-01';
const END_DATE = process.env.END_DATE || '2026-03-31';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function detectLanguage(title: string): string {
  const lower = title.toLowerCase();

  if (title.includes('#गोष्टघराची') || title.includes('गोष्ट घराची') || title.includes('गोष्टघराची') || lower.includes('marathi') || title.includes('मराठी')) {
    return 'Marathi';
  }
  if (title.includes('#વાતઘરની') || title.includes('વાત ઘરની') || title.includes('વાતઘરની') || lower.includes('gujarati') || title.includes('ગુજરાતી') || /[\u0A80-\u0AFF]/.test(title)) {
    return 'Gujarati';
  }
  if (title.includes('#வீடுசம்பந்தவிஷயம்') || title.includes('வீடு சம்பந்த விஷயம்') || lower.includes('tamil') || title.includes('தமிழ்') || /[\u0B80-\u0BFF]/.test(title)) {
    return 'Tamil';
  }
  if (title.includes('#ఇంటివిషయం') || title.includes('ఇంటి విషయం') || lower.includes('telugu') || title.includes('తెలుగు') || /[\u0C00-\u0C7F]/.test(title)) {
    return 'Telugu';
  }
  if (title.includes('#ಅಲ್ಟ್ರಾಟೆಕ್') || title.includes('#ಮನೆವಿಷಯ') || title.includes('ಮನೆ ವಿಷಯ') || lower.includes('kannada') || title.includes('ಕನ್ನಡ') || /[\u0C80-\u0CFF]/.test(title)) {
    return 'Kannada';
  }
  if (title.includes('#വീടിൻറെകാര്യം') || title.includes('വീടിന്റെ കാര്യം') || title.includes('വീടിൻറെകാര്യം') || lower.includes('malayalam') || title.includes('മലയാളം') || /[\u0D00-\u0D7F]/.test(title)) {
    return 'Malayalam';
  }
  if (title.includes('#বাড়িরবিষয়') || title.includes('বাড়ির বিষয়') || title.includes('বাড়িরবিষয়') || lower.includes('bengali') || title.includes('বাংলা') || /[\u0980-\u09FF]/.test(title)) {
    return 'Bengali';
  }
  if (title.includes('#କଥାଘରର') || title.includes('କଥା ଘରର') || title.includes('କଥାଘରର') || lower.includes('odia') || title.includes('ଓଡ଼ିଆ') || /[\u0B00-\u0B7F]/.test(title)) {
    return 'Odia';
  }
  if (lower.includes('punjabi') || title.includes('ਪੰਜਾਬੀ') || /[\u0A00-\u0A7F]/.test(title)) {
    return 'Punjabi';
  }
  if (title.includes('#बातघरकी') || title.includes('बात घर की') || title.includes('बातघरकी') || lower.includes('hindi') || title.includes('हिंदी') || /[\u0900-\u097F]/.test(title)) {
    return 'Hindi';
  }

  return 'English';
}

let cachedVideos: any[] = [];
let isScanning = false;

async function scanChannelVideos(authManager: AuthManager) {
  if (isScanning || cachedVideos.length > 0) return;
  isScanning = true;
  try {
    const reportPath = path.join(process.cwd(), 'YouTube_Analytics_Report.xlsx');
    try {
      await fs.access(reportPath);
      const workbook = XLSX.readFile(reportPath);
      if (workbook.SheetNames.includes('All Videos')) {
        const sheet = workbook.Sheets['All Videos'];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);
        if (rows.length > 0) {
          cachedVideos = rows.map(r => {
            const urlStr = String(r['Urls/ Topic'] || '');
            const match = urlStr.match(/https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
            const videoId = match ? match[1] : '';
            const title = urlStr.split('\n')[0] || '';
            return {
              videoId,
              title,
              publishedAt: r['Publish Date'] || '',
              url: match ? match[0] : '',
              lang: r['Lang'] || 'English',
              hashtag: r['Hashtag'] || '',
              views: r['views'] || 0,
              organicViews: r['Organic Views'] || 0,
              paidViews: r['Paid Views'] || 0,
              watchTimeHr: r['watch time'] || 0,
              likes: r['likes'] || 0,
              subscribers: r['subscribers'] || 0
            };
          }).filter(v => v.videoId);
          console.log(`[Dashboard] Loaded ${cachedVideos.length} public videos directly from YouTube_Analytics_Report.xlsx`);
          return;
        }
      }
    } catch {
      // Excel not found, fallback to scanning YouTube API
    }

    const auth = await authManager.getAuthClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const channelRes = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      id: [CHANNEL_ID]
    });

    const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return;

    let nextPageToken: string | undefined = undefined;
    const vids: any[] = [];

    while (vids.length < 500) {
      const playlistRes: any = await youtube.playlistItems.list({
        part: ['snippet'],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: nextPageToken
      });

      const items = playlistRes.data.items || [];
      for (const item of items) {
        const publishedAt = item.snippet?.publishedAt || '';
        const videoId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title || '';
        const description = item.snippet?.description || '';
        const thumbnail = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';

        if (videoId) {
          vids.push({
            videoId,
            title,
            description,
            publishedAt,
            thumbnail,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            lang: detectLanguage(title)
          });
        }
      }

      nextPageToken = playlistRes.data.nextPageToken || undefined;
      if (!nextPageToken) break;
    }

    cachedVideos = vids;
    console.log(`[Dashboard] Cached ${cachedVideos.length} videos from channel`);
  } catch (err: any) {
    console.error('[Dashboard] Error scanning videos:', err.message);
  } finally {
    isScanning = false;
  }
}

async function getVideoAnalytics(videoId: string, authManager: AuthManager) {
  const auth = await authManager.getAuthClient();
  const yta = google.youtubeAnalytics({ version: 'v2', auth });

  let totalViews = 0;
  let watchTimeMinutes = 0;
  let likes = 0;
  let avgDurationSecs = 0;
  let subscribers = 0;
  let paidViews = 0;
  let searchViews = 0;
  let playlistViews = 0;
  let endScreenViews = 0;
  let hashtagViews = 0;
  let returningViewers = 0;
  const rawSources: Record<string, number> = {};

  try {
    const coreRes = await yta.reports.query({
      ids: `channel==${CHANNEL_ID}`,
      startDate: '2020-01-01',
      endDate: '2026-12-31',
      metrics: 'views,estimatedMinutesWatched,likes,averageViewDuration,subscribersGained',
      filters: `video==${videoId}`
    });

    if (coreRes.data.rows && coreRes.data.rows.length > 0) {
      const row = coreRes.data.rows[0];
      totalViews = Number(row[0]) || 0;
      watchTimeMinutes = Number(row[1]) || 0;
      likes = Number(row[2]) || 0;
      avgDurationSecs = Number(row[3]) || 0;
      subscribers = Number(row[4]) || 0;
    }

    const trafficRes = await yta.reports.query({
      ids: `channel==${CHANNEL_ID}`,
      startDate: '2020-01-01',
      endDate: '2026-12-31',
      metrics: 'views',
      dimensions: 'insightTrafficSourceType',
      filters: `video==${videoId}`
    });

    if (trafficRes.data.rows) {
      for (const r of trafficRes.data.rows) {
        const type = String(r[0]);
        const count = Number(r[1]) || 0;
        rawSources[type] = count;
        if (type === 'ADVERTISING') paidViews += count;
        if (type === 'YT_SEARCH') searchViews += count;
        if (type === 'PLAYLIST') playlistViews += count;
        if (type === 'END_SCREEN') endScreenViews += count;
        if (type === 'HASHTAGS') hashtagViews += count;
      }
    }

    const subStatusRes = await yta.reports.query({
      ids: `channel==${CHANNEL_ID}`,
      startDate: '2020-01-01',
      endDate: '2026-12-31',
      metrics: 'views',
      dimensions: 'subscribedStatus',
      filters: `video==${videoId}`
    });

    if (subStatusRes.data.rows) {
      for (const sRow of subStatusRes.data.rows) {
        if (String(sRow[0]) === 'SUBSCRIBED') {
          returningViewers = Number(sRow[1]) || 0;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Dashboard] Analytics fetch warning for ${videoId}:`, err.message);
  }

  const organicViews = Math.max(0, totalViews - paidViews);
  const watchTimeHr = Number((watchTimeMinutes / 60).toFixed(2));

  return {
    videoId,
    totalViews,
    organicViews,
    paidViews,
    searchViews,
    playlistViews,
    endScreenViews,
    hashtagViews,
    watchTimeHr,
    avgDurationFormatted: formatDuration(avgDurationSecs),
    avgDurationSecs,
    subscribers,
    likes,
    returningViewers,
    rawSources
  };
}

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YouTube Analytics - Deep Video & Hashtag Explorer</title>
  <style>
    :root {
      --bg-dark: #0f0f0f;
      --card-bg: #212121;
      --card-hover: #2a2a2a;
      --yt-red: #ff0000;
      --yt-blue: #3ea6ff;
      --yt-green: #2ba640;
      --yt-amber: #fbc02d;
      --text-main: #f1f1f1;
      --text-muted: #aaaaaa;
      --border-color: #383838;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background: var(--bg-dark); color: var(--text-main); min-height: 100vh; padding-bottom: 50px; }
    
    header {
      background: #181818;
      border-bottom: 1px solid var(--border-color);
      padding: 14px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand svg { width: 32px; height: 32px; fill: var(--yt-red); }
    .brand h1 { font-size: 19px; font-weight: 600; letter-spacing: -0.2px; }
    .channel-badge {
      background: #2a2a2a;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      color: var(--yt-blue);
      border: 1px solid #444;
    }
    .auth-badge {
      background: rgba(43, 166, 64, 0.15);
      color: #4ade80;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid rgba(43, 166, 64, 0.4);
    }

    .container { max-width: 1400px; margin: 24px auto; padding: 0 20px; }

    /* Search & Hashtag Bar */
    .search-section {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .search-input-group {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .search-input-group input {
      flex: 1;
      background: #121212;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 18px;
      color: white;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-input-group input:focus { border-color: var(--yt-blue); }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-primary { background: var(--yt-blue); color: #000; }
    .btn-primary:hover { background: #65b8ff; }
    .btn-excel { background: #107c41; color: white; }
    .btn-excel:hover { background: #159c53; }

    /* Hashtag Quick Filters */
    .hashtag-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.5px; }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      background: #2b2b2b;
      border: 1px solid #444;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      cursor: pointer;
      color: #e0e0e0;
      transition: all 0.2s;
    }
    .pill:hover { background: #3b3b3b; border-color: var(--yt-blue); color: white; }
    .pill.active { background: var(--yt-blue); color: #000; font-weight: 600; border-color: var(--yt-blue); }

    /* Video Table */
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }
    .table-header-info {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th {
      background: #181818;
      padding: 14px 16px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
    }
    td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color);
      font-size: 14px;
      vertical-align: middle;
    }
    tr.clickable-row { cursor: pointer; transition: background 0.15s; }
    tr.clickable-row:hover { background: var(--card-hover); }

    .video-cell { display: flex; align-items: center; gap: 14px; max-width: 480px; }
    .video-cell img { width: 110px; height: 62px; object-fit: cover; border-radius: 6px; background: #333; flex-shrink: 0; }
    .video-title { font-weight: 600; color: #fff; font-size: 13.5px; line-height: 1.35; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .video-url { font-size: 11px; color: var(--yt-blue); text-decoration: none; }
    .badge-lang {
      background: #333;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #ddd;
    }
    .btn-inspect {
      background: #2b2b2b;
      color: var(--yt-blue);
      border: 1px solid #444;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-inspect:hover { background: var(--yt-blue); color: #000; }

    /* Modal for Deep Analytics */
    .modal-backdrop {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.82);
      backdrop-filter: blur(4px);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .modal-backdrop.active { display: flex; }
    .modal-content {
      background: #1c1c1c;
      width: 90%;
      max-width: 950px;
      max-height: 90vh;
      overflow-y: auto;
      border-radius: 14px;
      border: 1px solid var(--border-color);
      box-shadow: 0 10px 40px rgba(0,0,0,0.8);
      padding: 28px;
      position: relative;
    }
    .close-btn {
      position: absolute;
      top: 20px;
      right: 20px;
      font-size: 26px;
      color: #aaa;
      background: none;
      border: none;
      cursor: pointer;
    }
    .close-btn:hover { color: white; }

    .modal-header { display: flex; gap: 20px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color); }
    .modal-header img { width: 200px; height: 112px; object-fit: cover; border-radius: 8px; }
    .modal-header h2 { font-size: 18px; margin-bottom: 8px; line-height: 1.4; }
    .modal-header .links { display: flex; gap: 12px; font-size: 13px; }

    /* Analytics KPI Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: #252525;
      padding: 16px;
      border-radius: 10px;
      border: 1px solid #333;
    }
    .kpi-card.highlight-organic { border-left: 4px solid var(--yt-green); }
    .kpi-card.highlight-paid { border-left: 4px solid var(--yt-amber); }
    .kpi-card.highlight-total { border-left: 4px solid var(--yt-blue); }
    .kpi-card.highlight-watch { border-left: 4px solid #a855f7; }
    .kpi-title { font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
    .kpi-value { font-size: 24px; font-weight: 700; color: #fff; }

    /* Traffic Breakdown Cards */
    .traffic-box {
      background: #252525;
      padding: 20px;
      border-radius: 10px;
      border: 1px solid #333;
      margin-bottom: 20px;
    }
    .traffic-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #333;
      font-size: 14px;
    }
    .traffic-row:last-child { border-bottom: none; }
    .traffic-name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .traffic-val { font-weight: 700; color: var(--yt-blue); }

    .loading-spinner {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
      font-size: 16px;
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
      <h1>YouTube Deep Analytics Explorer</h1>
      <span class="channel-badge">UltraTech Cement</span>
      <span class="auth-badge">● OAuth Active</span>
    </div>
    <div>
      <button class="btn btn-excel" onclick="exportExcel()">📥 Download Multi-Tab Excel</button>
    </div>
  </header>

  <div class="container">

    <!-- Search Section -->
    <div class="search-section">
      <div class="search-input-group">
        <input type="text" id="searchInput" placeholder="Search by Hashtag (e.g. #BaatGharKi, #बातघरकी, #गोष्टघराची) or video title..." onkeyup="if(event.key==='Enter') applyFilter()">
        <button class="btn btn-primary" onclick="applyFilter()">🔍 Search</button>
        <button class="btn" style="background:#333; color:#fff;" onclick="resetFilter()">Reset</button>
      </div>

      <div class="hashtag-label">Quick Hashtag Filters (#BaatGharKi 10 Languages):</div>
      <div class="pills">
        <div class="pill active" onclick="setHashtag('')">All Videos</div>
        <div class="pill" onclick="setHashtag('#BaatGharKi')">#BaatGharKi (English)</div>
        <div class="pill" onclick="setHashtag('#बातघरकी')">#बातघरकी (Hindi)</div>
        <div class="pill" onclick="setHashtag('#गोष्टघराची')">#गोष्टघराची (Marathi)</div>
        <div class="pill" onclick="setHashtag('#વાતઘરની')">#વાતઘરની (Gujarati)</div>
        <div class="pill" onclick="setHashtag('#வீடுசம்பந்தவிஷயம்')">#வீடுசம்பந்தவிஷயம் (Tamil)</div>
        <div class="pill" onclick="setHashtag('#ಅಲ್ಟ್ರಾಟೆಕ್')">#ಅಲ್ಟ್ರಾಟೆಕ್ (Kannada)</div>
        <div class="pill" onclick="setHashtag('#ఇంటివిషయం')">#ఇంటివిషయం (Telugu)</div>
        <div class="pill" onclick="setHashtag('#വീടിൻറെകാര്യം')">#വീടിൻറെകാര്യം (Malayalam)</div>
        <div class="pill" onclick="setHashtag('#বাড়িরবিষয়')">#বাড়িরবিষয় (Bengali)</div>
        <div class="pill" onclick="setHashtag('#କଥାଘରର')">#କଥାଘରର (Odia)</div>
      </div>
    </div>

    <!-- Table Section -->
    <div class="table-container">
      <div class="table-header-info">
        <h3 id="tableCountText">Scanning videos...</h3>
        <span style="font-size: 13px; color: var(--text-muted);">Click on any row to drill deep into video metrics</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Video</th>
            <th>Language</th>
            <th>Publish Date</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="videoTableBody">
          <tr><td colspan="4" class="loading-spinner">Loading videos from YouTube channel...</td></tr>
        </tbody>
      </table>
    </div>

  </div>

  <!-- Deep Analytics Modal -->
  <div class="modal-backdrop" id="analyticsModal" onclick="if(event.target===this) closeModal()">
    <div class="modal-content">
      <button class="close-btn" onclick="closeModal()">×</button>
      <div id="modalBody">
        <div class="loading-spinner">Fetching deep video analytics from YouTube API...</div>
      </div>
    </div>
  </div>

  <script>
    let allVideos = [];
    let currentFilter = '';

    async function loadVideos() {
      try {
        const res = await fetch('/api/videos');
        const data = await res.json();
        allVideos = data.videos || [];
        renderTable();
      } catch (err) {
        document.getElementById('videoTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:#ff5555;padding:30px;">Failed to load videos</td></tr>';
      }
    }

    function renderTable() {
      const q = currentFilter.trim().toLowerCase();
      const filtered = allVideos.filter(v => {
        if (!q) return true;
        return v.title.toLowerCase().includes(q) || v.description.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q);
      });

      document.getElementById('tableCountText').innerText = 'Showing ' + filtered.length + ' Videos' + (currentFilter ? ' for "' + currentFilter + '"' : '');

      const tbody = document.getElementById('videoTableBody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:#888;">No videos found matching current filter.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(v => {
        const dateStr = v.publishedAt ? v.publishedAt.substring(0, 10) : '';
        return '<tr class="clickable-row" onclick="openDeepAnalytics(\\'' + v.videoId + '\\')">' +
          '<td>' +
            '<div class="video-cell">' +
              '<img src="' + v.thumbnail + '" alt="thumb">' +
              '<div>' +
                '<div class="video-title">' + escapeHtml(v.title) + '</div>' +
                '<a class="video-url" href="' + v.url + '" target="_blank" onclick="event.stopPropagation()">Watch on YouTube ↗</a>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span class="badge-lang">' + v.lang + '</span></td>' +
          '<td style="color:#aaa;">' + dateStr + '</td>' +
          '<td><button class="btn-inspect" onclick="event.stopPropagation(); openDeepAnalytics(\\'' + v.videoId + '\\')">Deep Analytics 🔍</button></td>' +
        '</tr>';
      }).join('');
    }

    function setHashtag(tag) {
      currentFilter = tag;
      document.getElementById('searchInput').value = tag;
      document.querySelectorAll('.pill').forEach(p => {
        if ((!tag && p.innerText === 'All Videos') || (tag && p.innerText.includes(tag))) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
      renderTable();
    }

    function applyFilter() {
      currentFilter = document.getElementById('searchInput').value;
      renderTable();
    }

    function resetFilter() {
      setHashtag('');
    }

    async function openDeepAnalytics(videoId) {
      const modal = document.getElementById('analyticsModal');
      const modalBody = document.getElementById('modalBody');
      modal.classList.add('active');
      modalBody.innerHTML = '<div class="loading-spinner">Querying YouTube Analytics API for video: ' + videoId + '...</div>';

      const vid = allVideos.find(v => v.videoId === videoId) || { title: 'Video Analytics', url: 'https://youtube.com/watch?v=' + videoId, thumbnail: '' };

      try {
        const res = await fetch('/api/video-analytics?videoId=' + videoId);
        const data = await res.json();
        const a = data.analytics;

        modalBody.innerHTML = 
          '<div class="modal-header">' +
            (vid.thumbnail ? '<img src="' + vid.thumbnail + '" alt="thumb">' : '') +
            '<div>' +
              '<h2>' + escapeHtml(vid.title) + '</h2>' +
              '<div class="links">' +
                '<a href="' + vid.url + '" target="_blank" style="color:var(--yt-blue);">Open on YouTube ↗</a> | ' +
                '<a href="https://studio.youtube.com/video/' + videoId + '/analytics/tab-reach" target="_blank" style="color:#aaa;">Open in YouTube Studio Reach ↗</a>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="kpi-grid">' +
            '<div class="kpi-card highlight-total"><div class="kpi-title">👁️ Total Views</div><div class="kpi-value">' + (a.totalViews || 0).toLocaleString() + '</div></div>' +
            '<div class="kpi-card highlight-organic"><div class="kpi-title">🌿 Organic Views</div><div class="kpi-value">' + (a.organicViews || 0).toLocaleString() + '</div></div>' +
            '<div class="kpi-card highlight-paid"><div class="kpi-title">📢 Paid Views (AdWords)</div><div class="kpi-value">' + (a.paidViews || 0).toLocaleString() + '</div></div>' +
            '<div class="kpi-card highlight-watch"><div class="kpi-title">⏳ Watch Time (Hours)</div><div class="kpi-value">' + (a.watchTimeHr || 0).toLocaleString() + ' hr</div></div>' +
          '</div>' +

          '<div class="kpi-grid">' +
            '<div class="kpi-card"><div class="kpi-title">⏱️ Average View Duration</div><div class="kpi-value">' + (a.avgDurationFormatted || '00:00') + '</div></div>' +
            '<div class="kpi-card"><div class="kpi-title">🔔 Subscribers Gained</div><div class="kpi-value">' + (a.subscribers || 0).toLocaleString() + '</div></div>' +
            '<div class="kpi-card"><div class="kpi-title">👍 Likes</div><div class="kpi-value">' + (a.likes || 0).toLocaleString() + '</div></div>' +
            '<div class="kpi-card"><div class="kpi-title">🔄 Returning Viewers</div><div class="kpi-value">' + (a.returningViewers || 0).toLocaleString() + '</div></div>' +
          '</div>' +

          '<div class="traffic-box">' +
            '<h3 style="margin-bottom:14px; font-size:16px;">Detailed Traffic Sources Breakdown</h3>' +
            '<div class="traffic-row"><span class="traffic-name">🔍 YouTube Search</span><span class="traffic-val">' + (a.searchViews || 0).toLocaleString() + ' views</span></div>' +
            '<div class="traffic-row"><span class="traffic-name">📋 Playlists</span><span class="traffic-val">' + (a.playlistViews || 0).toLocaleString() + ' views</span></div>' +
            '<div class="traffic-row"><span class="traffic-name">⏹️ End Screens</span><span class="traffic-val">' + (a.endScreenViews || 0).toLocaleString() + ' views</span></div>' +
            '<div class="traffic-row"><span class="traffic-name">#️⃣ Hashtag Pages</span><span class="traffic-val">' + (a.hashtagViews || 0).toLocaleString() + ' views</span></div>' +
            '<div class="traffic-row"><span class="traffic-name">📢 YouTube Advertising (Paid)</span><span class="traffic-val">' + (a.paidViews || 0).toLocaleString() + ' views</span></div>' +
          '</div>';

      } catch (err) {
        modalBody.innerHTML = '<div style="color:#ff5555;padding:30px;text-align:center;">Failed to fetch analytics for this video.</div>';
      }
    }

    function closeModal() {
      document.getElementById('analyticsModal').classList.remove('active');
    }

    function exportExcel() {
      window.location.href = '/api/export';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    loadVideos();
  </script>
</body>
</html>`;

async function main() {
  const authManager = new AuthManager();

  // Pre-scan videos in background
  scanChannelVideos(authManager);

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url || '', true);
    const pathname = parsed.pathname || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML_CONTENT);
      return;
    }

    if (pathname === '/api/videos') {
      if (cachedVideos.length === 0) {
        await scanChannelVideos(authManager);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: cachedVideos.length, videos: cachedVideos }));
      return;
    }

    if (pathname === '/api/video-analytics') {
      const videoId = String(parsed.query.videoId || '');
      if (!videoId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing videoId' }));
        return;
      }

      try {
        const analytics = await getVideoAnalytics(videoId, authManager);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ analytics }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/export') {
      const filePath = path.join(process.cwd(), 'YouTube_Analytics_Report.xlsx');
      try {
        const fileContent = await fs.readFile(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="YouTube_Analytics_Report.xlsx"'
        });
        res.end(fileContent);
      } catch (err: any) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Excel report file not found. Run npm run export first.');
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 YouTube Deep Analytics Explorer running on:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

main().catch(console.error);
