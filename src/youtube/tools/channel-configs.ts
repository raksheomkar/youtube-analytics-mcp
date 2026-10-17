import { z } from "zod";
import { ToolConfig, ToolContext } from '../../types.js';
import { formatChannelInfo, formatVideoList } from '../../utils/formatters/channel.js';


export const channelTools: ToolConfig[] = [
  {
    name: "get_channel_info",
    description: "Get information about a YouTube channel (authenticated channel or client channel by ID)",
    category: "channel",
    schema: z.object({
      channelId: z.string().optional().describe("Optional YouTube Channel ID (e.g. UCxxxxxxxx). If omitted, retrieves data for the authenticated account.")
    }),
    handler: async ({ channelId }: { channelId?: string }, { getYouTubeClient }: ToolContext) => {
      try {
        const youtubeClient = await getYouTubeClient();
        const channelInfo = await youtubeClient.getChannelInfo(channelId);
        const formattedText = formatChannelInfo(channelInfo);
        
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
    name: "get_channel_videos",
    description: "Get list of channel videos with optional filters for demographic analysis",
    category: "channel",
    schema: z.object({
      channelId: z.string().optional().describe("Optional YouTube Channel ID (e.g. UCxxxxxxxx). If omitted, retrieves videos for authenticated account."),
      query: z.string().optional().describe("Optional search query to filter videos"),
      startDate: z.string().optional().describe("Optional start date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("Optional end date (YYYY-MM-DD)"),
      maxResults: z.number().optional().default(25).describe("Number of videos to return (default 25, max 50)")
    }),
    handler: async ({ channelId, query, startDate, endDate, maxResults = 25 }, { getYouTubeClient }: ToolContext) => {
      try {
        const youtubeClient = await getYouTubeClient();
        const videos = await youtubeClient.searchChannelVideos({
          channelId,
          query,
          startDate,
          endDate,
          maxResults: Math.min(maxResults, 50)
        });
        
        const formattedText = formatVideoList({ videos, filterOptions: { query, startDate, endDate } });
        
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
];
