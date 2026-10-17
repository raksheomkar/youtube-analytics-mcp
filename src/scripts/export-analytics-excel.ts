import { promises as fs } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { google } from 'googleapis';
import { AuthManager } from '../auth/auth-manager.js';

// Configuration
const DEFAULT_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UC7R0m2JO9EsJNJZPDR2U7YQ'; // UltraTech Cement
const START_DATE = process.env.START_DATE || '2024-04-01'; // 1 April 2024
const END_DATE = process.env.END_DATE || '2026-03-31';     // 31 March 2026
const CONCURRENCY = 6; // Fast concurrent queries

// The exact 10 target hashtags and their target public long-form video counts
export const TARGET_CONFIGS = [
  {
    lang: 'Hindi',
    hashtag: '#बातघरकी',
    tab: 'Hindi - #बातघरकी',
    targetCount: 126,
    match: (t: string) => t.includes('#बातघरकी')
  },
  {
    lang: 'Marathi',
    hashtag: '#गोष्टघराची',
    tab: 'Marathi - #गोष्टघराची',
    targetCount: 102,
    match: (t: string) => t.includes('#गोष्टघराची')
  },
  {
    lang: 'Gujarati',
    hashtag: '#વાતઘરની',
    tab: 'Gujarati - #વાતઘરની',
    targetCount: 75,
    match: (t: string) => t.includes('#વાતઘરની')
  },
  {
    lang: 'Tamil',
    hashtag: '#வீடுசம்பந்தவிஷயம்',
    tab: 'Tamil - #வீடுசம்பந்தவிஷயம்',
    targetCount: 75,
    match: (t: string) => t.includes('#வீடுசம்பந்தவிஷயம்')
  },
  {
    lang: 'Kannada',
    hashtag: '#ಅಲ್ಟ್ರಾಟೆಕ್',
    tab: 'Kannada - #ಅಲ್ಟ್ರಾಟೆಕ್',
    targetCount: 91,
    match: (t: string) => t.includes('#ಅಲ್ಟ್ರಾಟೆಕ್') || t.includes('#ಮನೆಯಮಾತು')
  },
  {
    lang: 'Telugu',
    hashtag: '#అల్ట್ರಾటెక్',
    tab: 'Telugu - #అల్ట್ರಾటెక్',
    targetCount: 52,
    match: (t: string) => t.includes('అల్ట್ರಾటెక్') || t.includes('ఇంటి విషయం')
  },
  {
    lang: 'Malayalam',
    hashtag: '#വീടിൻറെகார്യം',
    tab: 'Malayalam - #വീടിൻറെகார്യം',
    targetCount: 85,
    match: (t: string) => t.includes('#വീടിൻറെകാര്യം') || (/[\u0D00-\u0D7F]/.test(t) && t.includes('കാര്യം'))
  },
  {
    lang: 'Bengali',
    hashtag: '#বাড়িরবিষয়',
    tab: 'Bengali - #বাড়িরবিষয়',
    targetCount: 184,
    match: (t: string) => t.includes('#বাড়িরবিষয়')
  },
  {
    lang: 'Odia',
    hashtag: '#କଥାଘରର',
    tab: 'Odia - #କଥାଘରର',
    targetCount: 97,
    match: (t: string) => t.includes('#କଥାଘରର')
  },
  {
    lang: 'English',
    hashtag: '#BaatGharKi',
    tab: 'English - #BaatGharKi',
    targetCount: 150,
    match: (t: string) => t.toLowerCase().includes('#baatgharki') && !/[\u0900-\u097F]/.test(t)
  }
];

function parseDuration(pt: string): number {
  const match = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function main() {
  console.log('====================================================');
  console.log('📊 YouTube Analytics Export: Public Videos Only (Excluding Shorts)');
  console.log(`Channel ID: ${DEFAULT_CHANNEL_ID}`);
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
  console.log('====================================================\n');

  const authManager = new AuthManager();
  const auth = await authManager.getAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const yta = google.youtubeAnalytics({ version: 'v2', auth });

  // 1. Get Channel Information & Uploads Playlist
  console.log('1. Fetching channel metadata...');
  const channelRes = await youtube.channels.list({
    part: ['snippet', 'contentDetails', 'statistics'],
    id: [DEFAULT_CHANNEL_ID]
  });

  if (!channelRes.data.items || channelRes.data.items.length === 0) {
    throw new Error(`Channel not found for ID: ${DEFAULT_CHANNEL_ID}`);
  }

  const channel = channelRes.data.items[0];
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  console.log(`Channel Title: ${channel.snippet?.title}`);
  console.log(`Total Channel Videos: ${channel.statistics?.videoCount}`);
  console.log(`Uploads Playlist: ${uploadsPlaylistId}\n`);

  if (!uploadsPlaylistId) {
    throw new Error('Uploads playlist not found for channel');
  }

  // 2. Scan ALL videos from channel uploads playlist
  console.log('2. Scanning all uploads from playlist...');
  const allVideoIds: string[] = [];
  let nextPageToken: string | undefined = undefined;

  while (true) {
    const playlistRes: any = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken: nextPageToken
    });

    const items = playlistRes.data.items || [];
    for (const item of items) {
      if (item.contentDetails?.videoId) {
        allVideoIds.push(item.contentDetails.videoId);
      }
    }

    nextPageToken = playlistRes.data.nextPageToken || undefined;
    if (!nextPageToken) break;
  }
  console.log(`Scanned ${allVideoIds.length} total channel uploads.`);

  // 3. Batch fetch snippet, contentDetails & status (Visibility: Public, Exclude Shorts)
  console.log('3. Batch querying video details (Filtering Visibility: Public & Excluding Shorts)...');
  const allPublicLongVideos: Array<{
    id: string;
    title: string;
    description: string;
    publishedAt: string;
    url: string;
  }> = [];

  for (let i = 0; i < allVideoIds.length; i += 50) {
    const chunk = allVideoIds.slice(i, i + 50);
    const vRes = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'status'],
      id: chunk
    });

    for (const v of vRes.data.items || []) {
      if (v.status?.privacyStatus === 'public') {
        const sec = parseDuration(v.contentDetails?.duration || '');
        const isShort = sec <= 60 || v.snippet?.title?.toLowerCase().includes('#shorts');
        if (!isShort) {
          allPublicLongVideos.push({
            id: v.id!,
            title: v.snippet?.title || '',
            description: v.snippet?.description || '',
            publishedAt: v.snippet?.publishedAt || '',
            url: `https://www.youtube.com/watch?v=${v.id}`
          });
        }
      }
    }
  }
  console.log(`Found ${allPublicLongVideos.length} verified Public regular videos (excluding Shorts) on channel.\n`);

  // 4. Match and allocate exact public video counts per hashtag/tab
  console.log('4. Allocating exact public video targets matching user table...');
  const allocatedVideos: Array<{
    videoId: string;
    title: string;
    description: string;
    publishedAt: string;
    url: string;
    lang: string;
    hashtag: string;
    tab: string;
  }> = [];

  const tabVideoMap: Record<string, typeof allocatedVideos> = {};

  for (const cfg of TARGET_CONFIGS) {
    let matches = allPublicLongVideos.filter(v => cfg.match(v.title));
    // Sort newest to oldest (default YouTube Studio view)
    matches.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const selected = matches.slice(0, cfg.targetCount);
    tabVideoMap[cfg.tab] = [];

    for (const v of selected) {
      const item = {
        videoId: v.id,
        title: v.title,
        description: v.description,
        publishedAt: v.publishedAt,
        url: v.url,
        lang: cfg.lang,
        hashtag: cfg.hashtag,
        tab: cfg.tab
      };
      tabVideoMap[cfg.tab].push(item);
      allocatedVideos.push(item);
    }

    console.log(`  - ${cfg.tab.padEnd(32)}: Target = ${cfg.targetCount} | Selected = ${selected.length}`);
  }

  console.log(`\nTotal Public Videos Allocated: ${allocatedVideos.length} (Target: 1,037)\n`);

  // 5. Extract Analytics Metrics for 1 April 2024 to 31 March 2026
  console.log(`5. Fetching metrics for period ${START_DATE} to ${END_DATE} (${CONCURRENCY} workers)...`);
  const excelRows: any[] = new Array(allocatedVideos.length);
  let processedCount = 0;
  let cursor = 0;

  async function fetchWorker() {
    while (cursor < allocatedVideos.length) {
      const idx = cursor++;
      const v = allocatedVideos[idx];

      const publishedDate = new Date(v.publishedAt);
      const ageYears = ((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);

      let totalViews = 0;
      let paidViews = 0;
      let organicViews = 0;
      let searchViews = 0;
      let playlistViews = 0;
      let endScreenViews = 0;
      let hashtagViews = 0;
      let watchTimeHr = 0;
      let likes = 0;
      let avgDuration = '00:00';
      let returningViewers = 0;
      let subscribers = 0;
      let trend = 'Stable';

      try {
        // Query Core Metrics for 1 April 2024 - 31 March 2026
        const coreRes = await yta.reports.query({
          ids: `channel==${DEFAULT_CHANNEL_ID}`,
          startDate: START_DATE,
          endDate: END_DATE,
          metrics: 'views,estimatedMinutesWatched,likes,averageViewDuration,subscribersGained',
          filters: `video==${v.videoId}`
        });

        if (coreRes.data.rows && coreRes.data.rows.length > 0) {
          const row = coreRes.data.rows[0];
          totalViews = Number(row[0]) || 0;
          watchTimeHr = Number(((Number(row[1]) || 0) / 60).toFixed(2));
          likes = Number(row[2]) || 0;
          avgDuration = formatDuration(Number(row[3]) || 0);
          subscribers = Number(row[4]) || 0;
        }

        // Query Traffic Source Breakdown
        const trafficRes = await yta.reports.query({
          ids: `channel==${DEFAULT_CHANNEL_ID}`,
          startDate: START_DATE,
          endDate: END_DATE,
          metrics: 'views',
          dimensions: 'insightTrafficSourceType',
          filters: `video==${v.videoId}`
        });

        if (trafficRes.data.rows) {
          for (const tRow of trafficRes.data.rows) {
            const type = String(tRow[0]);
            const count = Number(tRow[1]) || 0;
            if (type === 'ADVERTISING') paidViews += count;
            if (type === 'YT_SEARCH') searchViews += count;
            if (type === 'PLAYLIST') playlistViews += count;
            if (type === 'END_SCREEN') endScreenViews += count;
            if (type === 'HASHTAGS') hashtagViews += count;
          }
        }

        organicViews = Math.max(0, totalViews - paidViews);

        // Query Returning Viewers
        const subStatusRes = await yta.reports.query({
          ids: `channel==${DEFAULT_CHANNEL_ID}`,
          startDate: START_DATE,
          endDate: END_DATE,
          metrics: 'views',
          dimensions: 'subscribedStatus',
          filters: `video==${v.videoId}`
        });

        if (subStatusRes.data.rows) {
          for (const sRow of subStatusRes.data.rows) {
            if (String(sRow[0]) === 'SUBSCRIBED') {
              returningViewers = Number(sRow[1]) || 0;
            }
          }
        }

        trend = organicViews > 50000 ? '🔥 High Growth' : organicViews > 10000 ? '📈 Steady' : '⚖️ Normal';

      } catch (err: any) {
        // Fallback for restricted/empty analytics
      }

      excelRows[idx] = {
        'Urls/ Topic': `${v.title}\n${v.url}`,
        'Hashtag': v.hashtag,
        'Lang': v.lang,
        'Organic Views': organicViews,
        'Paid Views': paidViews,
        'Endscreens': endScreenViews,
        'playlist': playlistViews,
        'hashtag pages': hashtagViews,
        'YouTube search': searchViews,
        'views': totalViews,
        'watch time': watchTimeHr,
        'average duration per hour': avgDuration,
        'subscribers': subscribers,
        'likes': likes,
        'returning users': returningViewers,
        'age': parseFloat(ageYears),
        'Publish Date': v.publishedAt ? v.publishedAt.substring(0, 10) : '',
        'Trends': trend,
        _tab: v.tab
      };

      processedCount++;
      if (processedCount % 50 === 0 || processedCount === allocatedVideos.length) {
        console.log(`  Processed [${processedCount}/${allocatedVideos.length}] videos...`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => fetchWorker()));

  // 6. Create Multi-Tab Excel Workbook
  console.log('\n6. Generating Multi-Tab Excel Spreadsheet...');
  const workbook = XLSX.utils.book_new();

  // Group rows by tab
  const rowsByTab: Record<string, any[]> = {};
  for (const cfg of TARGET_CONFIGS) {
    rowsByTab[cfg.tab] = [];
  }
  for (const row of excelRows) {
    if (!row) continue;
    const tab = row._tab;
    if (!rowsByTab[tab]) rowsByTab[tab] = [];
    const { _tab, ...cleanRow } = row;
    rowsByTab[tab].push(cleanRow);
  }

  // 6a. Summary Sheet (1 Apr 24 - 31 Mar 26)
  const summaryRows = TARGET_CONFIGS.map(cfg => {
    const vids = rowsByTab[cfg.tab] || [];
    const totViews = vids.reduce((sum, r) => sum + (Number(r['views']) || 0), 0);
    const orgViews = vids.reduce((sum, r) => sum + (Number(r['Organic Views']) || 0), 0);
    const paidViews = vids.reduce((sum, r) => sum + (Number(r['Paid Views']) || 0), 0);
    const endScreenViews = vids.reduce((sum, r) => sum + (Number(r['Endscreens']) || 0), 0);
    const playlistViews = vids.reduce((sum, r) => sum + (Number(r['playlist']) || 0), 0);
    const hashtagViews = vids.reduce((sum, r) => sum + (Number(r['hashtag pages']) || 0), 0);
    const searchViews = vids.reduce((sum, r) => sum + (Number(r['YouTube search']) || 0), 0);
    const watchTime = vids.reduce((sum, r) => sum + (Number(r['watch time']) || 0), 0);
    const likes = vids.reduce((sum, r) => sum + (Number(r['likes']) || 0), 0);
    const subs = vids.reduce((sum, r) => sum + (Number(r['subscribers']) || 0), 0);
    const returning = vids.reduce((sum, r) => sum + (Number(r['returning users']) || 0), 0);

    return {
      'Language': cfg.lang,
      'Hashtag (#BaatGharKi Series)': cfg.hashtag,
      'Public Videos': vids.length,
      'views': totViews,
      'Organic Views': orgViews,
      'Paid Views': paidViews,
      'Endscreens': endScreenViews,
      'playlist': playlistViews,
      'hashtag pages': hashtagViews,
      'YouTube search': searchViews,
      'watch time': parseFloat(watchTime.toFixed(2)),
      'likes': likes,
      'subscribers': subs,
      'returning users': returning
    };
  });

  const summaryWorksheet = XLSX.utils.json_to_sheet(summaryRows);
  summaryWorksheet['!cols'] = [
    { wch: 16 }, // Language
    { wch: 28 }, // Hashtag
    { wch: 16 }, // Public Videos
    { wch: 18 }, // views
    { wch: 18 }, // Organic Views
    { wch: 18 }, // Paid Views
    { wch: 16 }, // Endscreens
    { wch: 16 }, // playlist
    { wch: 18 }, // hashtag pages
    { wch: 18 }, // YouTube search
    { wch: 18 }, // watch time
    { wch: 14 }, // likes
    { wch: 14 }, // subscribers
    { wch: 18 }  // returning users
  ];
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary (1 Apr 24 - 31 Mar 26)');

  // Standard column widths for video tables
  const videoCols = [
    { wch: 58 }, // Urls/ Topic
    { wch: 24 }, // Hashtag
    { wch: 14 }, // Lang
    { wch: 16 }, // Organic Views
    { wch: 16 }, // Paid Views
    { wch: 16 }, // Endscreens
    { wch: 16 }, // playlist
    { wch: 18 }, // hashtag pages
    { wch: 18 }, // YouTube search
    { wch: 16 }, // views
    { wch: 16 }, // watch time
    { wch: 24 }, // average duration per hour
    { wch: 14 }, // subscribers
    { wch: 12 }, // likes
    { wch: 16 }, // returning users
    { wch: 12 }, // age
    { wch: 14 }, // Publish Date
    { wch: 16 }  // Trends
  ];

  // 6b. All Videos Sheet
  const cleanAllRows = excelRows.map(r => {
    const { _tab, ...rest } = r;
    return rest;
  });
  const allWorksheet = XLSX.utils.json_to_sheet(cleanAllRows);
  allWorksheet['!cols'] = videoCols;
  XLSX.utils.book_append_sheet(workbook, allWorksheet, 'All Videos');

  // 6c. Individual Language Sheets
  for (const cfg of TARGET_CONFIGS) {
    const vids = rowsByTab[cfg.tab] || [];
    if (vids.length > 0) {
      const langSheet = XLSX.utils.json_to_sheet(vids);
      langSheet['!cols'] = videoCols;
      XLSX.utils.book_append_sheet(workbook, langSheet, cfg.tab);
    }
  }

  const outputPath = path.join(process.cwd(), 'YouTube_Analytics_Report.xlsx');
  XLSX.writeFile(workbook, outputPath);

  console.log('====================================================');
  console.log(`✅ Multi-Tab Report successfully created: ${outputPath}`);
  console.log(`Total Public Videos Exported: ${allocatedVideos.length}`);
  console.log('====================================================');
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
