/**
 * Bridge.gs — Two-way sync between Railway (Super Connector) and BTC Comms Review (GitHub).
 *
 * Direction 1 — Railway → Comms Review (push):
 *   Reads BTC initiatives + action items from Railway.
 *   Updates pipeline.json bucket/status fields to reflect current SC state.
 *   Commits the updated file to GitHub.
 *
 * Direction 2 — Comms Review → Railway (pull):
 *   Scans GitHub Issues in btc-comms-review labeled "campaign-update".
 *   Parses issue body for: org name, new status, notes.
 *   Creates a Railway action item for any flagged update Bryan has left.
 *   Closes the GitHub Issue after processing.
 *
 * Runs every 30 minutes via time-based trigger.
 */

const Bridge = {

  GITHUB_OWNER: 'keyona-rerev',
  GITHUB_REPO:  'btc-comms-review',
  PIPELINE_PATH: 'pipeline.json',
  CAMPAIGNS_PATH: 'campaigns.json',

  _ghToken() {
    const t = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!t) throw new Error('GITHUB_TOKEN not set in Script Properties');
    return t;
  },

  _ghReq(method, path, body) {
    const opts = {
      method,
      muteHttpExceptions: true,
      headers: {
        'Authorization': 'Bearer ' + this._ghToken(),
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }
    };
    if (body) opts.payload = JSON.stringify(body);
    const res  = UrlFetchApp.fetch('https://api.github.com' + path, opts);
    const text = res.getContentText();
    try { return JSON.parse(text); } catch(e) { return text; }
  },

  _getFile(filePath) {
    return this._ghReq('get', '/repos/' + this.GITHUB_OWNER + '/' + this.GITHUB_REPO + '/contents/' + filePath);
  },

  _commitFile(filePath, content, currentSha, message) {
    return this._ghReq('put', '/repos/' + this.GITHUB_OWNER + '/' + this.GITHUB_REPO + '/contents/' + filePath, {
      message: message || 'chore: Debbie bridge sync ' + new Date().toISOString().substring(0, 10),
      content: Utilities.base64Encode(content),
      sha: currentSha
    });
  },

  // ─── Direction 1: Railway → GitHub ────────────────────────────────────────

  _pushRailwayToGitHub() {
    try {
      const initiatives  = Data.getBTCInitiatives();
      const actionItems  = Data.getBTCActionItems();

      // Map initiative IDs to status for quick lookup
      const initiativeMap = {};
      initiatives.forEach(i => { initiativeMap[i.initiative_id] = i; });

      // Fetch current pipeline.json from GitHub
      const pipelineFile = this._getFile(this.PIPELINE_PATH);
      const pipelineData = JSON.parse(Utilities.newBlob(Utilities.base64Decode(pipelineFile.content)).getDataAsString());

      // Update each pipeline entry's sc_status and open_actions from Railway
      pipelineData.pipeline = pipelineData.pipeline.map(entry => {
        const ini = initiativeMap[entry.sc_initiative_id];
        if (ini) {
          entry.sc_initiative_status = ini.status;
          entry.sc_initiative_priority = ini.priority;
        }
        // Count open action items tied to this initiative
        const openActions = actionItems.filter(a =>
          a.initiative_id === entry.sc_initiative_id && a.status !== 'Complete'
        );
        entry.open_action_count = openActions.length;
        entry.next_action = openActions.length
          ? openActions.sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1)[0].description
          : null;
        return entry;
      });

      pipelineData.meta.last_synced = new Date().toISOString().substring(0, 16) + ' UTC (Debbie)';

      this._commitFile(
        this.PIPELINE_PATH,
        JSON.stringify(pipelineData, null, 2),
        pipelineFile.sha,
        'chore: Debbie sync — Railway status pushed to pipeline.json'
      );
      Logger.log('Bridge: Railway → GitHub pipeline.json updated.');
    } catch(e) { Logger.log('Bridge._pushRailwayToGitHub error: ' + e.message); }
  },

  // ─── Direction 2: GitHub Issues → Railway ─────────────────────────────────

  _pullIssuesFromGitHub() {
    try {
      // Fetch open issues labeled "campaign-update"
      const issues = this._ghReq('get',
        '/repos/' + this.GITHUB_OWNER + '/' + this.GITHUB_REPO + '/issues?labels=campaign-update&state=open&per_page=20'
      );
      if (!Array.isArray(issues) || !issues.length) return;

      issues.forEach(issue => {
        try {
          // Parse issue body — expected format:
          // Org: SVX
          // Status: active
          // Notes: Had a great intro call, scheduling follow-up
          const body    = issue.body || '';
          const orgMatch    = body.match(/Org:\s*(.+)/i);
          const statusMatch = body.match(/Status:\s*(.+)/i);
          const notesMatch  = body.match(/Notes:\s*([\s\S]+?)(?:\n[A-Z]|$)/i);

          const org    = orgMatch    ? orgMatch[1].trim()    : issue.title;
          const status = statusMatch ? statusMatch[1].trim() : 'update';
          const notes  = notesMatch  ? notesMatch[1].trim()  : body.substring(0, 200);

          // Create a Railway action item so the update surfaces in Debbie's digest
          Railway.createActionItem({
            description: '[Comms Review] ' + org + ' — ' + status + ': ' + notes.substring(0, 150),
            action_type: 'Follow Up',
            priority: 'High',
            initiative_id: _inferInitiativeId(org),
            status: 'Open',
            source: 'Manual'
          });

          // Close the GitHub Issue so it doesn't re-process
          this._ghReq('patch',
            '/repos/' + this.GITHUB_OWNER + '/' + this.GITHUB_REPO + '/issues/' + issue.number,
            { state: 'closed', labels: ['campaign-update', 'debbie-processed'] }
          );

          Logger.log('Bridge: Issue #' + issue.number + ' processed and closed — ' + org);
        } catch(e) { Logger.log('Bridge: failed to process issue #' + issue.number + ': ' + e.message); }
      });
    } catch(e) { Logger.log('Bridge._pullIssuesFromGitHub error: ' + e.message); }
  },

  // ─── Main entry point ─────────────────────────────────────────────────────

  sync() {
    Logger.log('Bridge.sync() started — ' + new Date().toISOString());
    this._pushRailwayToGitHub();   // Railway → GitHub
    this._pullIssuesFromGitHub();  // GitHub Issues → Railway
    Logger.log('Bridge.sync() complete.');
  }
};

/**
 * Infer initiative ID from org name.
 * Maps known org names to their SC initiative IDs.
 */
function _inferInitiativeId(orgName) {
  const name = (orgName || '').toLowerCase();
  // Webinar partners
  if (name.includes('svx') || name.includes('ontario') || name.includes('clean tech north') ||
      name.includes('kafd') || name.includes('good investor')) {
    return 'INI-1775180449939'; // BTC Webinar Partner Program
  }
  // ABM targets
  if (name.includes('toronto') || name.includes('atmospheric') || name.includes('boann') ||
      name.includes('equality')) {
    return 'INI-1775180457900'; // BTC Institutional Investor ABM Canada
  }
  // Exit Lab fallback
  return 'INI-001';
}
