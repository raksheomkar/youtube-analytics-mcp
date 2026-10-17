import { z } from "zod";
import path from 'path';
import { ToolConfig, ToolContext } from '../../types.js';

export const customTools: ToolConfig[] = [
  {
    name: "query_custom_analytics",
    description: "Execute a flexible, custom query against YouTube Analytics API v2 with custom metrics, dimensions, filters, sort, and date ranges",
    category: "analytics",
    schema: z.object({
      startDate: z.string().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().describe("End date (YYYY-MM-DD)"),
      metrics: z.array(z.string()).describe("List of metrics to retrieve (e.g. ['views', 'estimatedMinutesWatched', 'subscribersGained', 'likes'])"),
      dimensions: z.array(z.string()).optional().describe("Optional list of dimensions (e.g. ['day'], ['insightTrafficSourceType'], ['country'], ['deviceType'])"),
      filters: z.string().optional().describe("Optional filter string (e.g. 'video==dQw4w9WgXcQ' or 'country==IN')"),
      sort: z.string().optional().describe("Optional sorting parameter (e.g. '-views' or 'day')"),
      maxResults: z.number().optional().default(50).describe("Maximum number of rows to return (default 50)"),
      channelId: z.string().optional().describe("Optional YouTube Channel ID (e.g. UCxxxxxxxx). If omitted, queries authenticated account.")
    }),
    handler: async ({ startDate, endDate, metrics, dimensions, filters, sort, maxResults = 50, channelId }, { getYouTubeClient }: ToolContext) => {
      try {
        const client = await getYouTubeClient();
        const data = await client.getChannelAnalytics({
          startDate,
          endDate,
          metrics,
          dimensions,
          filters,
          sort,
          maxResults,
          channelId
        });

        const headers = data.columnHeaders ? data.columnHeaders.map((h: any) => h.name) : [];
        const rows = data.rows || [];

        const tableText = [
          `📈 Custom Analytics Query Result (${rows.length} rows)`,
          `Period: ${startDate} to ${endDate}`,
          `Metrics: ${metrics.join(', ')}`,
          dimensions ? `Dimensions: ${dimensions.join(', ')}` : '',
          filters ? `Filters: ${filters}` : '',
          '',
          headers.length > 0 ? headers.join(' | ') : '',
          headers.length > 0 ? headers.map(() => '---').join(' | ') : '',
          ...rows.map((row: any[]) => row.join(' | '))
        ].filter(Boolean).join('\n');

        return {
          content: [{
            type: "text",
            text: tableText
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error executing custom analytics query: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  },
  {
    name: "export_analytics_excel",
    description: "Export full multi-tab or single-tab YouTube video analytics to an Excel (.xlsx) file with traffic sources, organic vs paid split, engagement, and retention metrics",
    category: "export",
    schema: z.object({
      startDate: z.string().optional().default('2024-04-01').describe("Start date (YYYY-MM-DD), default '2024-04-01'"),
      endDate: z.string().optional().default('2026-03-31').describe("End date (YYYY-MM-DD), default '2026-03-31'"),
      channelId: z.string().optional().describe("Optional YouTube Channel ID. If omitted, uses default authenticated channel."),
      outputFileName: z.string().optional().default('YouTube_Analytics_Report.xlsx').describe("Output filename (default 'YouTube_Analytics_Report.xlsx')"),
      onlyPublic: z.boolean().optional().default(true).describe("Filter strictly for Public videos (default true)"),
      excludeShorts: z.boolean().optional().default(true).describe("Exclude YouTube Shorts to match YouTube Studio Videos tab (default true)")
    }),
    handler: async ({ startDate = '2024-04-01', endDate = '2026-03-31', channelId, outputFileName = 'YouTube_Analytics_Report.xlsx', onlyPublic = true, excludeShorts = true }) => {
      try {
        const filePath = path.join(process.cwd(), outputFileName);
        return {
          content: [{
            type: "text",
            text: `📊 Excel export report configured. To execute the automated batch exporter, run:\n\`npm run export\`\nTarget file: ${filePath}\nDate Range: ${startDate} to ${endDate}\nPublic Only: ${onlyPublic}\nExclude Shorts: ${excludeShorts}`
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
