# YouTube Analytics MCP Server 🚀

A full-featured **Model Context Protocol (MCP)** server for **YouTube Data API v3** and **YouTube Analytics API v2**. 

Seamlessly integrates with **Claude Desktop**, **Cursor**, **Antigravity**, **Windsurf**, or any MCP-compatible AI assistant to analyze YouTube channels, track video performance, inspect audience retention curves, break down traffic sources (organic vs. paid), explore demographics, and export multi-tab Excel reports.

Developed and maintained by **[Omkar Rakshe](https://github.com/raksheomkar)**.

---

## 🌟 Key Capabilities

- 📊 **24 Specialized MCP Tools**: Complete coverage across channel health, video analytics, discovery, engagement, and audience retention.
- 🎯 **Deep Video Analytics**: Organic vs. Paid views breakdown, watch time in hours, average view duration, returning viewers, and subscribers gained.
- 📈 **Audience Retention & Drop-off Points**: Second-by-second watch ratios to identify hook weaknesses and viewer churn.
- 🚦 **Comprehensive Traffic Sources**: Insights across YouTube Search, Suggested Videos, External, Advertising, Playlists, End screens, and Hashtag pages.
- 🌐 **Demographics & Geography**: Age, gender, country distribution, device types (mobile, desktop, TV), and sharing platforms.
- ⚡ **Flexible Custom Analytics**: Execute arbitrary custom queries against YouTube Analytics API v2 with custom dimensions and metrics.
- 📑 **Automated Multi-Tab Excel Reporting**: One-click generation of comprehensive `.xlsx` workbooks with summary dashboards and language/topic breakdowns.
- 🖥️ **Interactive Web Dashboard**: Built-in real-time analytics browser on `localhost:3000`.

---

## 🛠️ Complete List of 24 MCP Tools

### 1. Channel Overview & Health
| Tool Name | Description |
| :--- | :--- |
| `get_channel_info` | Channel snippet, total subscriber count, total views, and video counts. |
| `get_channel_overview` | Aggregated performance metrics (views, watch time, avg view duration, subscribers gained/lost) over a date range. |
| `get_comparison_metrics` | Period-over-period comparison (e.g. current 30 days vs previous 30 days) with growth percentages. |
| `get_average_view_percentage` | Average percentage watched across videos to assess content stickiness. |

### 2. Video Search & Deep Analytics
| Tool Name | Description |
| :--- | :--- |
| `get_channel_videos` | List recent channel videos with optional date ranges and search query filters. |
| `get_video_details` | Full metadata: title, description, tags, duration, definition (HD/SD), caption status, and lifetime statistics. |
| `get_video_analytics` | Deep video performance: total views, organic vs. paid views, watch time (hrs), avg duration, likes, subscribers gained, returning viewers, and traffic source overview. |

### 3. Traffic Sources & Discovery
| Tool Name | Description |
| :--- | :--- |
| `get_traffic_sources` | Comprehensive breakdown of how viewers find content (Search, Suggested, Ads, External, Playlists, End screens, Hashtags). |
| `get_search_terms` | Top YouTube search keywords and queries that led viewers to a specific video or channel. |
| `get_device_type_analytics` | Viewer breakdown by device type (mobile, desktop, tablet, TV) and operating system. |
| `get_optimal_posting_time` | Day-of-week engagement analysis to discover optimal publishing days. |

### 4. Audience Demographics & Geography
| Tool Name | Description |
| :--- | :--- |
| `get_video_demographics` | Viewer age group and gender distribution percentages. |
| `get_geographic_distribution` | Views and watch time distribution across countries and regions. |
| `get_subscriber_analytics` | Performance comparison between subscribed vs. unsubscribed viewers. |

### 5. Audience Retention & Pacing
| Tool Name | Description |
| :--- | :--- |
| `get_audience_retention` | Audience retention curve (`elapsedVideoTimeRatio`) across the duration of a video. |
| `get_retention_dropoff_points` | Pinpoints exact timestamps where viewer drop-off spikes exceed a defined threshold. |

### 6. Engagement & Social Sharing
| Tool Name | Description |
| :--- | :--- |
| `get_engagement_metrics` | Likes, comments, shares, and subscriber conversion rates over time. |
| `get_sharing_analytics` | Breakdown of sharing platforms (WhatsApp, Facebook, Twitter, Copy Link, etc.). |
| `get_card_endscreen_performance` | Impressions, clicks, and CTR for interactive cards and end screens. |

### 7. Custom Queries & Automation
| Tool Name | Description |
| :--- | :--- |
| `query_custom_analytics` | Run raw queries against YouTube Analytics API v2 with custom metrics, dimensions, filters, and sorting. |
| `export_analytics_excel` | Configures and triggers multi-tab Excel analytics reporting with visibility and shorts filters. |

### 8. System & Authentication
| Tool Name | Description |
| :--- | :--- |
| `check_auth_status` | Inspect current Google OAuth token status, expiration, and authenticated account. |
| `revoke_auth` | Safely clear stored credentials to switch Google accounts. |
| `get_server_info` | Server version, active tools count, and capabilities summary. |

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher)
- A **Google Cloud Project** with **YouTube Data API v3** and **YouTube Analytics API** enabled.

### 2. Clone and Install

```bash
git clone https://github.com/raksheomkar/youtube-analytics-mcp.git
cd youtube-analytics-mcp
npm install
```

### 3. Setup Google Cloud OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable both:
   - **YouTube Data API v3**
   - **YouTube Analytics API**
3. Navigate to **APIs & Services > Credentials**.
4. Create an **OAuth 2.0 Client ID** (Application type: **Desktop App**).
5. Download the JSON and save it as:
   ```
   src/auth/credentials.json
   ```
   *(You can also use `src/auth/credentials.template.json` as a reference).*

### 4. Authenticate

Run the interactive CLI authenticator:

```bash
npm run auth
```

Follow the browser prompt to sign in with your Google account and grant read-only YouTube Analytics permissions. A secure `src/auth/token.json` will be automatically generated and auto-refreshed.

### 5. Build

```bash
npm run build
```

---

## 🔌 Connecting to AI Clients (MCP Setup)

### Claude Desktop
Add this to your `claude_desktop_config.json` (located at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "youtube-analytics": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/youtube-analytics-mcp/build/index.js"],
      "env": {
        "YOUTUBE_CHANNEL_ID": "YOUR_CHANNEL_ID_OPTIONAL"
      }
    }
  }
}
```

### Cursor IDE
In Cursor, go to **Settings > Features > MCP**, click **Add New MCP Server**:
- **Name**: `youtube-analytics`
- **Type**: `command`
- **Command**: `node /ABSOLUTE/PATH/TO/youtube-analytics-mcp/build/index.js`

### Antigravity / Gemini CLI
Add to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "youtube-analytics": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/youtube-analytics-mcp/build/index.js"]
    }
  }
}
```

---

## 📊 Automated Excel Exporter

Generate a multi-tab, comprehensive analytics workbook analyzing channel videos across date ranges, topics, hashtags, and language categories:

```bash
# Export analytics with default config (1 April 2024 to 31 March 2026)
npm run export

# Or override with custom parameters via environment variables
START_DATE=2024-01-01 END_DATE=2025-12-31 npm run export
```

The output file `YouTube_Analytics_Report.xlsx` includes:
- Summary Tab with aggregate metrics across all topics/languages.
- Filtered public long-form video tabs.
- 18 key metrics including Organic Views, Paid Views, Search Views, Playlists, End screens, Watch Time (Hours), Avg Duration, Returning Users, and Trends.

---

## 🖥️ Interactive Web Dashboard

Launch the local web dashboard for searching and drilling down into any video:

```bash
npm run dashboard
```

Open your browser at `http://localhost:3000` to inspect channel uploads, search tags, and view traffic source charts.

---

## 🔒 Security & Privacy

- **Local Storage**: OAuth tokens are stored exclusively on your local machine in `src/auth/token.json`.
- **Ignored by Git**: Both `credentials.json` and `token.json` are strictly excluded in `.gitignore` to prevent accidental credential leakage.
- **Read-Only Scope**: Queries read-only analytics data (`yt-analytics.readonly` and `youtube.readonly`).

---

## 👤 Author

**Omkar Rakshe**
- GitHub: [@raksheomkar](https://github.com/raksheomkar)
- Email: [omkarrakshe2808@gmail.com](mailto:omkarrakshe2808@gmail.com)

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
