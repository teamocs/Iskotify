/**
 * ISKOTIFY — Google Sheets Sync Trigger
 *
 * ONE-TIME SETUP INSTRUCTIONS:
 * 1. Open your Master Google Sheet
 * 2. Click Extensions → Apps Script
 * 3. Paste this entire file into the editor
 * 4. Update WEBHOOK_URL and SYNC_SECRET below
 * 5. Click Save
 * 6. From the menu: Run → installTrigger (run once to install the onEdit trigger)
 * 7. Approve the permissions popup
 *
 * After setup, every cell edit in the sheet will trigger a sync to Supabase.
 * Check View → Executions to see the log of each sync call.
 */

var WEBHOOK_URL = 'https://your-admin-domain.vercel.app/api/sheets/sync';
var SYNC_SECRET = 'replace-with-your-SYNC_SECRET-value';

function onEditTrigger(e) {
  try {
    var response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + SYNC_SECRET,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ source: 'apps-script' }),
      muteHttpExceptions: true,
    });
    Logger.log('Sync response: ' + response.getContentText());
  } catch (err) {
    Logger.log('Sync error: ' + err.toString());
  }
}

function installTrigger() {
  // Remove any existing triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Install a new onEdit trigger for the active spreadsheet
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  Logger.log('Trigger installed successfully.');
}
