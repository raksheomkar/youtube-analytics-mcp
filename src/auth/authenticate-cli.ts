import { promises as fs } from 'fs';
import path from 'path';
import http from 'http';
import { URL } from 'url';
import { OAuth2Client } from 'google-auth-library';
import readline from 'readline';

const AUTH_DIR = path.join(process.cwd(), 'src', 'auth');
const CREDENTIALS_PATH = path.join(AUTH_DIR, 'credentials.json');
const TOKEN_PATH = path.join(AUTH_DIR, 'token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtubepartner'
];

async function main() {
  const credentialsContent = await fs.readFile(CREDENTIALS_PATH, 'utf8');
  const credentials = JSON.parse(credentialsContent);
  const clientConfig = credentials.installed || credentials.web;

  if (!clientConfig) {
    throw new Error('Invalid credentials.json: missing installed or web configuration');
  }

  const PORT = 8888;
  const REDIRECT_URI = `http://localhost:${PORT}`;

  const oauth2Client = new OAuth2Client(
    clientConfig.client_id,
    clientConfig.client_secret,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('\n======================================================');
  console.log('👉 PLEASE OPEN THIS URL IN YOUR BROWSER:');
  console.log('------------------------------------------------------');
  console.log(authUrl);
  console.log('======================================================\n');

  async function handleCode(code: string) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const tokenData = {
        type: 'authorized_user',
        client_id: clientConfig.client_id,
        client_secret: clientConfig.client_secret,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date
      };

      await fs.writeFile(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
      console.log('\n✅ Authentication successful! Tokens saved to src/auth/token.json');
      process.exit(0);
    } catch (err: any) {
      console.error('Error exchanging code for tokens:', err.message);
      process.exit(1);
    }
  }

  // Set up local server to receive callback
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '', REDIRECT_URI);
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authentication Failed</h1><p>${error}</p>`);
        console.error('Authorization error received:', error);
        server.close();
        process.exit(1);
        return;
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication Successful!</h1><p>You can close this tab and return to your terminal.</p>');
        server.close();
        await handleCode(code);
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>Error processing callback</h1>');
      console.error(err);
    }
  });

  server.listen(PORT, () => {
    console.log(`Local callback server listening on http://localhost:${PORT}`);
  });

  // Also read line from console if user pastes URL or code directly
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Or paste the redirect URL / auth code here: ', async (answer) => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    let code = trimmed;
    try {
      if (trimmed.includes('code=')) {
        const parsed = new URL(trimmed.startsWith('http') ? trimmed : `http://localhost/${trimmed}`);
        code = parsed.searchParams.get('code') || trimmed;
      }
    } catch {
      code = trimmed;
    }
    server.close();
    await handleCode(code);
  });
}

main().catch(console.error);
