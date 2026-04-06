/**
 * Claude.gs — Anthropic API wrapper for Debbie.
 * Identical to Phoebe's Claude.gs, BTC persona applied.
 */

var ClaudeAPI = (function() {
  function _key() {
    var k = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!k) throw new Error('ANTHROPIC_API_KEY not set in Script Properties');
    return k;
  }

  function call(prompt, maxTokens) {
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      muteHttpExceptions: true,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': _key(),
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens || 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    var body = JSON.parse(res.getContentText());
    if (body.error) throw new Error('Claude error: ' + body.error.message);
    return body.content[0].text;
  }

  function parseReply(emailText, initiatives) {
    var initList = initiatives.slice(0, 10).map(function(i) {
      return i.initiative_id + ': ' + i.initiative_name;
    }).join('\n');
    var prompt = 'You are Debbie, Keyona Meeks BTC (Black Tech Capital) communications agent. She replied to a check-in email.\n\n'
      + 'Active BTC initiatives:\n' + initList + '\n\n'
      + 'Parse her reply. Return ONLY valid JSON, no preamble:\n'
      + '{"updates":[{"type":"action_done","description":"...","action_id":"id or null"},{"type":"action_new","description":"...","priority":"High|Medium|Low","due_date":"YYYY-MM-DD or null","initiative_id":"id or null"},{"type":"initiative_status","initiative_id":"id","new_status":"Active|Planning|Paused|Blocked|Complete"},{"type":"note","text":"..."}],"summary":"one sentence"}\n\n'
      + 'Email:\n' + emailText;
    var raw = call(prompt, 1000);
    var match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Claude response');
    return JSON.parse(match[0]);
  }

  function generateCheckIn(initiatives, overdueItems, actionItems) {
    var top = initiatives
      .filter(function(i) { return ['Active', 'Blocked'].indexOf(i.status) >= 0; })
      .sort(function(a, b) {
        var o = { Critical: 4, High: 3, Medium: 2, Low: 1, Parked: 0 };
        return (o[b.priority] || 0) - (o[a.priority] || 0);
      })
      .slice(0, 3);

    var overdueText = overdueItems.length
      ? overdueItems.map(function(a) { return '- ' + a.description + ' (due ' + (a.due_date || '').substring(0, 10) + ')'; }).join('\n')
      : 'None — queue is clear';

    var actionText = actionItems.length
      ? actionItems.filter(function(a) { return a.status !== 'Complete'; }).slice(0, 10)
          .map(function(a) { return '- [' + a.status + '] ' + a.description + (a.due_date ? ' (due ' + a.due_date.substring(0, 10) + ')' : ''); }).join('\n')
      : 'No open BTC action items';

    var prompt = 'You are Debbie, Keyona Meeks BTC (Black Tech Capital) communications and relationship agent. Write a daily morning BTC check-in email.\n'
      + 'Tone: Direct, sharp, VC-aware. No fluff. NO EMOJIS.\n'
      + 'Format: Plain readable paragraphs and bullet lists. No HTML tags — return plain text only.\n'
      + 'Subject line is already set. Start with "Good morning Keyona,"\n\n'
      + 'BTC ACTIVE PRIORITIES:\n'
      + (top.length
          ? top.map(function(i) {
              return '- ' + i.initiative_name + ' (' + i.status + ', ' + i.priority + ' priority)\n  Goal: ' + (i.goal || 'not set') + '\n  Notes: ' + (i.notes || '').substring(0, 120);
            }).join('\n\n')
          : 'No active BTC priorities found.')
      + '\n\nOVERDUE ITEMS:\n' + overdueText
      + '\n\nOPEN ACTION ITEMS:\n' + actionText
      + '\n\nEnd with: Reply to this email with updates — Debbie will parse and update Super Connector and the BTC Comms Review.\nSign as Debbie.';

    return call(prompt, 1500);
  }

  return { call: call, parseReply: parseReply, generateCheckIn: generateCheckIn };
})();
