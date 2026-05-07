import { google } from "googleapis";
import { logger } from "./logger.js";

export async function appendToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  rowData: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowData] },
    });

    logger.info({ spreadsheetId, sheetName, cols: rowData.length }, "row appended to Google Sheet");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, spreadsheetId, sheetName }, "appendToSheet failed");
    return { success: false, error: msg };
  }
}
