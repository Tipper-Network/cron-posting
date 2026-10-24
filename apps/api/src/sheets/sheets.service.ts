import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { google, sheets_v4 } from 'googleapis';
import { CatalogRow } from '../schedule/due';

const SHEET_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);

  async ping(): Promise<{ ok: boolean; rows: number; detail: string }> {
    try {
      const rows = await this.listRows();
      return { ok: true, rows: rows.length, detail: 'sheet read' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(detail);
      return { ok: false, rows: 0, detail };
    }
  }

  async listRows(): Promise<CatalogRow[]> {
    const sheetId = required('GOOGLE_SHEETS_ID');
    const tab = tabName();
    const sheets = google.sheets({ version: 'v4', auth: this.auth() as never });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: quotedTab(tab),
    });
    return toRows(result.data);
  }

  async updateRow(sheetRow: number, patch: Record<string, string>): Promise<void> {
    const entries = Object.entries(patch);
    if (entries.length === 0) return;
    const sheetId = required('GOOGLE_SHEETS_ID');
    const tab = tabName();
    const header = await this.header();
    const data = entries.map(([key, value]) => {
      const index = header.indexOf(key);
      if (index < 0) throw new Error(`sheet column missing: ${key}`);
      return {
        range: `${quotedTab(tab)}!${columnLetter(index)}${sheetRow}`,
        values: [[value]],
      };
    });
    const sheets = google.sheets({ version: 'v4', auth: this.auth() as never });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: 'RAW', data },
    });
  }

  private async header(): Promise<string[]> {
    const sheetId = required('GOOGLE_SHEETS_ID');
    const tab = tabName();
    const sheets = google.sheets({ version: 'v4', auth: this.auth() as never });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${quotedTab(tab)}!1:1`,
    });
    return (result.data.values?.[0] ?? []).map((cell) => String(cell).trim());
  }

  private auth() {
    const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (inline) {
      return new google.auth.GoogleAuth({
        credentials: JSON.parse(inline) as Record<string, unknown>,
        scopes: [SHEET_SCOPE],
      });
    }
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFile) {
      return new google.auth.GoogleAuth({
        keyFile,
        scopes: [SHEET_SCOPE],
      });
    }
    const fromFile = tokenFromPath(process.env.GOOGLE_OAUTH_TOKEN_PATH);
    const clientId = fromFile?.client_id || process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = fromFile?.client_secret || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = fromFile?.refresh_token || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (clientId && clientSecret && refreshToken) {
      const client = new google.auth.OAuth2(clientId, clientSecret);
      client.setCredentials({ refresh_token: refreshToken });
      return client;
    }
    throw new Error(
      'Set GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_OAUTH_TOKEN_PATH, or GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN',
    );
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function tabName(): string {
  return process.env.GOOGLE_SHEETS_TAB || 'publish_catalog';
}

function quotedTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function tokenFromPath(path: string | undefined): {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
} | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as {
    client_id?: string;
    client_secret?: string;
    refresh_token?: string;
  };
}

function toRows(data: sheets_v4.Schema$ValueRange): CatalogRow[] {
  const values = data.values ?? [];
  if (values.length === 0) return [];
  const header = values[0].map((cell) => String(cell).trim());
  return values.slice(1).map((raw, index) => {
    const row: CatalogRow = { sheetRow: String(index + 2) };
    header.forEach((key, column) => {
      if (!key) return;
      row[key] = String(raw[column] ?? '').trim();
    });
    return row;
  });
}
