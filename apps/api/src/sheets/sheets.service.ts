import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { google, sheets_v4 } from 'googleapis';

export type CatalogRow = Record<string, string>;

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
    const tab = process.env.GOOGLE_SHEETS_TAB || 'publish_catalog';
    const range = `'${tab.replace(/'/g, "''")}'`;
    const sheets = google.sheets({ version: 'v4', auth: this.auth() as never });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });
    return toRows(result.data);
  }

  private auth() {
    const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (inline) {
      return new google.auth.GoogleAuth({
        credentials: JSON.parse(inline),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFile) {
      return new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }
    const tokenPath = process.env.GOOGLE_OAUTH_TOKEN_PATH;
    if (tokenPath) {
      const saved = JSON.parse(readFileSync(tokenPath, 'utf8')) as {
        client_id?: string;
        client_secret?: string;
        refresh_token?: string;
      };
      const client = new google.auth.OAuth2(saved.client_id, saved.client_secret);
      client.setCredentials({ refresh_token: saved.refresh_token });
      return client;
    }
    throw new Error(
      'Set GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_OAUTH_TOKEN_PATH',
    );
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function toRows(data: sheets_v4.Schema$ValueRange): CatalogRow[] {
  const values = data.values ?? [];
  if (values.length === 0) return [];
  const header = values[0].map((cell) => String(cell).trim());
  return values.slice(1).map((raw) => {
    const row: CatalogRow = {};
    header.forEach((key, index) => {
      row[key] = String(raw[index] ?? '').trim();
    });
    return row;
  });
}
