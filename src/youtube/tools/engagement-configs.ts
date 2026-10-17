import { z } from "zod";
import { ToolConfig, ToolContext } from '../../types.js';
import { parseAnalyticsResponse, parseEngagementMetrics } from '../../utils/parsers/analytics.js';
import { analyzeEngagement, formatEngagementMetrics } from '../../utils/formatters/engagement.js';


export const engagementTools: ToolConfig[] = [
  {
    name: "get_engagement_metrics",
    description: "Get engagement metrics (likes/comments/shares analysis) to measure viewer emotional investment and content interaction quality",
    category: "engagement",
    schema: z.object({
      startDate: z.string().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().describe("End date (YYYY-MM-DD)"),
      videoId: z.string().optional().describe("Optional video ID for specific analysis"),
      channelId: z.string().optional().describe("Optional YouTube Channel ID (e.g. UCxxxxxxxx). If omitted, queries authenticated account.")
    }),
    handler: async ({ startDate, endDate, videoId, channelId }, { getYouTubeClient }: ToolContext) => {
      try {
        const youtubeClient = await getYouTubeClient();
        const rawData = await youtubeClient.getEngagementMetrics({ 
          startDate, endDate, videoId, channelId 
        });
        
        // Parse the raw data
        const parsedData = parseAnalyticsResponse(rawData);
        const metrics = parseEngagementMetrics(parsedData);
        
        // Analyze and format the data
        const analysis = analyzeEngagement(metrics);
        const formattedText = formatEngagementMetrics(analysis, { startDate, endDate, videoId });
        
        return {
          content: [{
            type: "text",
            text: formattedText
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
    },
  },
  {
    name: "get_sharing_analytics",
    description: "Get breakdown of how and where viewers share your videos (WhatsApp, Twitter, Facebook, Copy Link, etc.)",
    category: "engagement",
    schema: z.object({
      startDate: z.string().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().describe("End date (YYYY-MM-DD)"),
      videoId: z.string().optional().describe("Optional video ID to filter for a specific video"),
      channelId: z.string().optional().describe("Optional YouTube Channel ID (e.g. UCxxxxxxxx). If omitted, queries authenticated account.")
    }),
    handler: async ({ startDate, endDate, videoId, channelId }, { getYouTubeClient }: ToolContext) => {
      try {
        const youtubeClient = await getYouTubeClient();
        const rawData = await youtubeClient.getSharingAnalytics({ startDate, endDate, videoId, channelId });
        const rows = rawData.rows || [];
        const lines = [
          `📤 Video Sharing Breakdown (${startDate} to ${endDate}):`,
          '',
          'Platform / Service | Share Count',
          '---|---',
          ...rows.map((r: any[]) => `${r[0]} | ${Number(r[1]).toLocaleString()}`)
        ];

        return {
          content: [{
            type: "text",
            text: lines.join('\n')
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
    name: "get_card_endscreen_performance",
    description: "Analyze performance of interactive elements: info cards, end screen cards, and click-through rates",
    category: "engagement",
    schema: z.object({
      videoId: z.string().describe("YouTube Video ID"),
      startDate: z.string().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().describe("End date (YYYY-MM-DD)"),
      channelId: z.string().optional().describe("Optional YouTube Channel ID (e.g. UCxxxxxxxx). If omitted, queries authenticated account.")
    }),
    handler: async ({ videoId, startDate, endDate, channelId }, { getYouTubeClient }: ToolContext) => {
      try {
        const youtubeClient = await getYouTubeClient();
        const rawData = await youtubeClient.getCardEndScreenPerformance({ videoId, startDate, endDate, channelId });
        const rows = rawData.rows || [];
        const lines = [
          `🎴 Card & Endscreen Performance for ${videoId} (${startDate} to ${endDate}):`,
          '',
          'Video ID | Impressions | Clicks | Click-Through Rate',
          '---|---|---|---',
          ...rows.map((r: any[]) => `${r[0]} | ${Number(r[1]).toLocaleString()} | ${Number(r[2]).toLocaleString()} | ${(Number(r[3]) * 100).toFixed(2)}%`)
        ];

        return {
          content: [{
            type: "text",
            text: lines.join('\n')
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
