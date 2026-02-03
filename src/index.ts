import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');

class GoogleDriveAuth {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  async getTokenFromCode(code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.error(`[AUTH] Tokens saved to ${TOKEN_PATH}`);
  }

  loadTokens(): boolean {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        this.oauth2Client.setCredentials(tokens);
        console.error('[AUTH] Tokens loaded');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[AUTH] Error loading tokens:', error);
      return false;
    }
  }

  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  isAuthenticated(): boolean {
    const credentials = this.oauth2Client.credentials;
    return !!(credentials && credentials.access_token);
  }
}

const authManager = new GoogleDriveAuth();
const server = new Server(
  { name: "google-drive-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const tools: Tool[] = [
  {
    name: "gdrive_search_files",
    description: "Search for files in Google Drive using query syntax",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default: 20)", default: 20 }
      },
      required: ["query"]
    }
  },
  {
    name: "gdrive_get_file_content",
    description: "Retrieve file content from Google Drive",
    inputSchema: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "Google Drive file ID" },
        mime_type: { type: "string", description: "Export MIME type", default: "text/plain" }
      },
      required: ["file_id"]
    }
  },
  {
    name: "gdrive_list_files",
    description: "List files in Google Drive",
    inputSchema: {
      type: "object",
      properties: {
        folder_id: { type: "string", description: "Folder ID (default: root)" },
        limit: { type: "number", description: "Max results", default: 20 }
      }
    }
  },
  {
    name: "gdrive_auth_status",
    description: "Check authentication status",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "gdrive_authenticate",
    description: "Complete OAuth authentication with code",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Authorization code from Google" }
      },
      required: ["code"]
    }
  }
];

async function handleSearchFiles(args: any) {
  if (!authManager.isAuthenticated()) {
    return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
  }

  const drive = google.drive({ version: 'v3', auth: authManager.getClient() });
  const limit = Math.min(args.limit || 20, 100);

  try {
    const response = await drive.files.list({
      q: args.query,
      pageSize: limit,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink)'
    });

    return {
      content: [{ type: "text", text: JSON.stringify(response.data.files, null, 2) }]
    };
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
}

async function handleGetFileContent(args: any) {
  if (!authManager.isAuthenticated()) {
    return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
  }

  const drive = google.drive({ version: 'v3', auth: authManager.getClient() });

  try {
    const metadata = await drive.files.get({ fileId: args.file_id, fields: 'mimeType, name' });
    const mimeType = metadata.data.mimeType || '';
    let content: string;

    if (mimeType.startsWith('application/vnd.google-apps.')) {
      const exportResponse = await drive.files.export({
        fileId: args.file_id,
        mimeType: args.mime_type || 'text/plain'
      }, { responseType: 'text' });
      content = exportResponse.data as string;
    } else {
      const response = await drive.files.get({
        fileId: args.file_id,
        alt: 'media'
      }, { responseType: 'text' });
      content = response.data as string;
    }

    return { content: [{ type: "text", text: `File: ${metadata.data.name}\n\n${content}` }] };
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
}

async function handleListFiles(args: any) {
  if (!authManager.isAuthenticated()) {
    return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
  }

  const drive = google.drive({ version: 'v3', auth: authManager.getClient() });
  const limit = Math.min(args.limit || 20, 100);
  let query = args.folder_id ? `'${args.folder_id}' in parents` : "'root' in parents";
  query += " and trashed=false";

  try {
    const response = await drive.files.list({
      q: query,
      pageSize: limit,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink)'
    });

    return {
      content: [{ type: "text", text: JSON.stringify(response.data.files, null, 2) }]
    };
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
}

async function handleAuthStatus() {
  if (authManager.isAuthenticated()) {
    return { content: [{ type: "text", text: JSON.stringify({ authenticated: true }, null, 2) }] };
  } else {
    const authUrl = authManager.getAuthUrl();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          authenticated: false,
          authorizationUrl: authUrl,
          instructions: "Open the URL, authorize, then use gdrive_authenticate with the code"
        }, null, 2)
      }]
    };
  }
}

async function handleAuthenticate(args: any) {
  try {
    await authManager.getTokenFromCode(args.code);
    return { content: [{ type: "text", text: "Successfully authenticated!" }] };
  } catch (error: any) {
    return { content: [{ type: "text", text: `Auth failed: ${error.message}` }], isError: true };
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "gdrive_search_files": return await handleSearchFiles(args);
    case "gdrive_get_file_content": return await handleGetFileContent(args);
    case "gdrive_list_files": return await handleListFiles(args);
    case "gdrive_auth_status": return await handleAuthStatus();
    case "gdrive_authenticate": return await handleAuthenticate(args);
    default: return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

async function main() {
  console.error('[SERVER] Starting Google Drive MCP Server...');
  authManager.loadTokens();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[SERVER] Google Drive MCP Server running');
}

main().catch((error) => {
  console.error('[ERROR]:', error);
  process.exit(1);
});
