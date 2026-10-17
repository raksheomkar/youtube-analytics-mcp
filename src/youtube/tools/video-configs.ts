import { z } from "zod";
import { ToolConfig, ToolContext } from '../../types.js';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const videoTools: ToolConfig[] = [
  {
    name: "get_video_details",
    description: "Get comprehensive metadata, tags, duration, and lifetime statistics for a specific YouTube video",
    category: "video",
    schema: z.object({
      videoId: z.string().describe("YouTube Video ID (e.g. dQw4w9WgXcQ)")
    }),
    handler: async ({ videoId }, { getYouTubeClient }: ToolContext) => {
      try {
        const client = await getYouTubeClient();
        const details = await client.getVideoDetails(videoId);

        const out = [
          `🎬 Video Details for: ${details.snippet.title}`,
          `URL: https://www.youtube.com/watch?v=${videoId}`,
          `Published At: ${details.snippet.publishedAt}`,
          `Channel: ${details.snippet.channelTitle} (${details.snippet.channelId})`,
          `Duration: ${details.contentDetails.duration}`,
          `Definition: ${details.contentDetails.definition?.toUpperCase()} | Dimension: ${details.contentDetails.dimension}`,
          `Caption: ${details.contentDetails.caption ? 'Available' : 'None'}`,
          `Category ID: ${details.snippet.categoryId}`,
          `Language: ${details.snippet.defaultLanguage || details.snippet.defaultAudioLanguage || 'Not specified'}`,
          '',
          `📊 Lifetime Statistics:`,
          `- Views: ${Number(details.statistics.viewCount).toLocaleString()}`,
          `- Likes: ${Number(details.statistics.likeCount).toLocaleString()}`,
          `- Comments: ${Number(details.statistics.commentCount).toLocaleString()}`,
          '',
          `🏷️ Tags (${details.snippet.tags?.length || 0}):`,
          details.snippet.tags ? details.snippet.tags.join(', ') : 'None',
          '',
          `📝 Description:`,
          details.snippet.description || 'No description provided'
        ].join('\n');

        return {
          content: [{
            type: "text",
            text: out
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  },
  {
    name: "get_video_analytics",
    description: "Get detailed performance analytics for a video in a date range, including organic vs paid views, watch time, subscribers gained, returning viewers, and traffic source breakdown",
    category: "video",
    schema: z.object({
      videoId: z.string().describe("YouTube Video ID"),
      startDate: z.string().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().describe("End date (YYYY-MM-DD)"),
      channelId: z.string().optional().describe("Optional YouTube Channel ID (e.g. UCxxxxxxxx). If omitted, queries authenticated account.")
    }),
    handler: async ({ videoId, startDate, endDate, channelId }, { getYouTubeClient }: ToolContext) => {
      try {
        const client = await getYouTubeClient();
        
        // 1. Core metrics
        const coreRes = await client.getVideoAnalytics(videoId, {
          startDate,
          endDate,
          channelId,
          metrics: ['views', 'estimatedMinutesWatched', 'likes', 'averageViewDuration', 'subscribersGained']
        });

        let totalViews = 0;
        let watchTimeMinutes = 0;
        let likes = 0;
        let avgDurationSecs = 0;
        let subscribers = 0;

        if (coreRes.rows && coreRes.rows.length > 0) {
          const row = coreRes.rows[0];
          totalViews = Number(row[0]) || 0;
          watchTimeMinutes = Number(row[1]) || 0;
          likes = Number(row[2]) || 0;
          avgDurationSecs = Number(row[3]) || 0;
          subscribers = Number(row[4]) || 0;
        }

        // 2. Traffic sources
        const trafficRes = await client.getVideoAnalytics(videoId, {
          startDate,
          endDate,
          channelId,
          metrics: ['views'],
          dimensions: ['insightTrafficSourceType']
        });

        let paidViews = 0;
        let searchViews = 0;
        let playlistViews = 0;
        let endScreenViews = 0;
        let hashtagViews = 0;
        let suggestedViews = 0;
        let externalViews = 0;

        if (trafficRes.rows) {
          for (const row of trafficRes.rows) {
            const type = String(row[0]);
            const cnt = Number(row[1]) || 0;
            if (type === 'ADVERTISING') paidViews += cnt;
            else if (type === 'YT_SEARCH') searchViews += cnt;
            else if (type === 'PLAYLIST') playlistViews += cnt;
            else if (type === 'END_SCREEN') endScreenViews += cnt;
            else if (type === 'HASHTAGS') hashtagViews += cnt;
            else if (type === 'RELATED_VIDEO') suggestedViews += cnt;
            else if (type === 'EXT_URL') externalViews += cnt;
          }
        }

        const organicViews = Math.max(0, totalViews - paidViews);
        const watchTimeHr = (watchTimeMinutes / 60).toFixed(2);

        // 3. Returning viewers
        let returningViewers = 0;
        try {
          const subRes = await client.getVideoAnalytics(videoId, {
            startDate,
            endDate,
            channelId,
            metrics: ['views'],
            dimensions: ['subscribedStatus']
          });
          if (subRes.rows) {
            for (const r of subRes.rows) {
              if (String(r[0]) === 'SUBSCRIBED') {
                returningViewers = Number(r[1]) || 0;
              }
            }
          }
        } catch {
          // ignore if dimension not supported
        }

        const report = [
          `📊 Video Analytics Report: ${videoId}`,
          `📅 Period: ${startDate} to ${endDate}`,
          '',
          `👁️ Views & Audience:`,
          `- Total Views: ${totalViews.toLocaleString()}`,
          `- Organic Views: ${organicViews.toLocaleString()} (${totalViews > 0 ? ((organicViews / totalViews) * 100).toFixed(1) : 0}%)`,
          `- Paid Views (Ads): ${paidViews.toLocaleString()} (${totalViews > 0 ? ((paidViews / totalViews) * 100).toFixed(1) : 0}%)`,
          `- Returning / Subscribed Viewers: ${returningViewers.toLocaleString()}`,
          `- Subscribers Gained: ${subscribers.toLocaleString()}`,
          '',
          `⏱️ Watch Time & Retention:`,
          `- Estimated Watch Time: ${Number(watchTimeHr).toLocaleString()} Hours (${watchTimeMinutes.toLocaleString()} mins)`,
          `- Average View Duration: ${formatDuration(avgDurationSecs)}`,
          `- Likes: ${likes.toLocaleString()}`,
          '',
          `🚦 Traffic Source Breakdown:`,
          `- YouTube Search: ${searchViews.toLocaleString()}`,
          `- Suggested Videos: ${suggestedViews.toLocaleString()}`,
          `- External Websites: ${externalViews.toLocaleString()}`,
          `- Playlists: ${playlistViews.toLocaleString()}`,
          `- End Screens: ${endScreenViews.toLocaleString()}`,
          `- Hashtag Pages: ${hashtagViews.toLocaleString()}`,
          `- Advertising: ${paidViews.toLocaleString()}`
        ].join('\n');

        return {
          content: [{
            type: "text",
            text: report
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  }
];
