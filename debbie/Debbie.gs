/**
 * Debbie.gs — Daily check-in, reply processing, status decay.
 * BTC-scoped version of Phoebe.
 */

const Debbie = {

  sendCheckIn() {
    try {
      const initiatives  = Data.getBTCInitiatives();
      const overdueItems = Data.getOverdueItems();
      const actionItems  = Data.getBTCActionItems().filter(a => a.status !== 'Complete');
      const userEmail    = Session.getActiveUser().getEmail();

      const body = ClaudeAPI.generateCheckIn(initiatives, overdueItems, actionItems);

      GmailApp.sendEmail(
        userEmail,
        'BTC Morning Check-In — ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
        'Enable HTML to view.',
        {
          htmlBody: '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;"><pre style="white-space:pre-wrap;font-family:sans-serif;font-size:14px;line-height:1.6;">' + body + '</pre></div>',
          name: 'Debbie'
        }
      );
      Logger.log('BTC daily check-in sent to ' + userEmail);
    } catch(e) { Logger.log('Debbie.sendCheckIn error: ' + e.message); }
  },

  processReplies() {
    try {
      const label          = _getOrCreateLabel('Debbie/Replies');
      const processedLabel = _getOrCreateLabel('Debbie/Processed');
      const threads        = label.getThreads(0, 20);
      if (!threads.length) return;
      const initiatives = Data.getBTCInitiatives();
      threads.forEach(thread => {
        const msg = thread.getMessages().pop();
        try {
          const parsed = ClaudeAPI.parseReply(msg.getPlainBody(), initiatives);
          _applyUpdates(parsed.updates);
          Logger.log('Debbie reply processed: ' + parsed.summary);
        } catch(e) { Logger.log('Debbie reply parse failed: ' + e.message); }
        thread.removeLabel(label);
        thread.addLabel(processedLabel);
      });
    } catch(e) { Logger.log('Debbie.processReplies error: ' + e.message); }
  },

  scanDecay() {
    try {
      const overdue = Data.getOverdueItems();
      if (!overdue.length) return;
      const userEmail = Session.getActiveUser().getEmail();
      const listItems = overdue.slice(0, 10).map(a =>
        '<li>' + a.description + ' (due ' + (a.due_date || '').substring(0, 10) + ')</li>'
      ).join('');
      GmailApp.sendEmail(
        userEmail,
        'BTC Status Decay Alert — ' + overdue.length + ' overdue items',
        '',
        {
          htmlBody: '<html><body style="font-family:sans-serif;"><h2>BTC Overdue Alert</h2><p>Debbie detected <strong>' + overdue.length + '</strong> overdue BTC action items.</p><ul>' + listItems + '</ul>' + (overdue.length > 10 ? '<p>...and ' + (overdue.length - 10) + ' more.</p>' : '') + '<p><em>Automated alert — Debbie Agent</em></p></body></html>',
          name: 'Debbie'
        }
      );
      Logger.log('BTC decay alert sent — ' + overdue.length + ' overdue items');
    } catch(e) { Logger.log('Debbie.scanDecay error: ' + e.message); }
  }
};

function _getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function _applyUpdates(updates) {
  if (!updates || !updates.length) return;
  updates.forEach(u => {
    try {
      if (u.type === 'action_done' && u.action_id) {
        Railway.updateActionItemStatus(u.action_id, 'Complete', new Date().toISOString().substring(0, 10));
      } else if (u.type === 'action_new') {
        Railway.createActionItem({
          description: u.description,
          priority: u.priority || 'Medium',
          due_date: u.due_date || null,
          initiative_id: u.initiative_id || 'SPRINT',
          status: 'Open',
          source: 'Phoebe'
        });
      } else if (u.type === 'initiative_status' && u.initiative_id) {
        Railway.updateInitiativeStatus(u.initiative_id, u.new_status);
      }
    } catch(e) { Logger.log('_applyUpdates error on ' + u.type + ': ' + e.message); }
  });
  // After any update, bust cache and trigger a bridge sync
  try { Bridge.sync(); } catch(e) { Logger.log('Post-reply bridge sync error: ' + e.message); }
}
