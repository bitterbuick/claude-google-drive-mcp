import express from 'express';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const PORT = 3000;
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const app = express();

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent'
});

console.log('\n' + '='.repeat(80));
console.log('GOOGLE DRIVE OAUTH DEBUGGER');
console.log('='.repeat(80) + '\n');
console.log('Step 1: Open this URL:\n');
console.log(authUrl + '\n');
console.log('Step 2: Authorize and wait for redirect...\n');

app.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;

  console.log('\nCallback received!');

  if (error) {
    res.send(`<h1>Error: ${error}</h1>`);
    console.error('OAuth error:', error);
    process.exit(1);
  }

  if (!code) {
    res.send('<h1>No code received</h1>');
    console.error('No authorization code');
    process.exit(1);
  }

  try {
    console.log('Exchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code.toString());

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log(`\nTokens saved to ${TOKEN_PATH}`);

    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const aboutResponse = await drive.about.get({ fields: 'user' });

    console.log(`Authenticated as: ${aboutResponse.data.user?.emailAddress}\n`);

    res.send(`<h1>Success!</h1><p>Authenticated as: ${aboutResponse.data.user?.emailAddress}</p><p>Close this window.</p>`);

    setTimeout(() => process.exit(0), 2000);
  } catch (error: any) {
    console.error('Token exchange failed:', error.message);
    res.send(`<h1>Failed</h1><pre>${error.message}</pre>`);
    setTimeout(() => process.exit(1), 2000);
  }
});

app.listen(PORT, () => {
  console.log(`Callback server listening on http://localhost:${PORT}\n`);
});
