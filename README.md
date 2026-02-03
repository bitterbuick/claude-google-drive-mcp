# Google Drive MCP Server

Custom MCP server for Google Drive with full OAuth control.

## Quick Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure OAuth credentials:
   ```bash
   cp .env.template .env
   # Edit .env with your Google OAuth credentials
   ```

3. Build:
   ```bash
   npm run build
   ```

4. Authenticate:
   ```bash
   npm run debug:oauth
   ```
   - Open the URL in your browser
   - Authorize the application
   - Tokens saved automatically

5. Start server:
   ```bash
   npm start
   ```

## Integration with Claude.ai

Configure Claude.ai MCP settings:
- Command: `node`
- Arguments: `/absolute/path/to/google-drive-mcp-server/dist/index.js`

Get path with: `pwd`

## Available Tools

- `gdrive_search_files` - Search with queries
- `gdrive_get_file_content` - Read file contents
- `gdrive_list_files` - List folder contents
- `gdrive_auth_status` - Check authentication
- `gdrive_authenticate` - Manual authentication

## Google OAuth Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth Client ID -> Desktop app
3. Add redirect URI: `http://localhost:3000/oauth/callback`
4. Copy Client ID and Secret to `.env`
