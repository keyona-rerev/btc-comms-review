/**
 * DEBBIE — BTC Communications + Railway Agent
 * Mirror of Phoebe, scoped to BTC venture only.
 *
 * Two-way sync:
 *   Railway (SC) <---> BTC Comms Review (GitHub)
 *
 * Triggers (set via setupAllTriggers):
 *   Daily 7am        → sendDailyCheckIn
 *   Every 6 hours    → scanStatusDecay
 *   Every 30 min     → processReplies
 *   Every 30 min     → syncCommsReview  (bidirectional bridge)
 *
 * Script Properties required:
 *   SC_API_KEY          — Railway API key
 *   ANTHROPIC_API_KEY   — Claude API key
 *   GITHUB_TOKEN        — Personal access token with repo scope
 */

function sendDailyCheckIn()  { Debbie.sendCheckIn(); }
function scanStatusDecay()   { Debbie.scanDecay(); }
function processReplies()    { Debbie.processReplies(); }
function syncCommsReview()   { Bridge.sync(); }

function setupAllTriggers() {
  const managed = ['sendDailyCheckIn','scanStatusDecay','processReplies','syncCommsReview'];
  ScriptApp.getProjectTriggers().forEach(t => {
    if (managed.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyCheckIn').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('scanStatusDecay').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('processReplies').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('syncCommsReview').timeBased().everyMinutes(30).create();
  Logger.log('Debbie triggers set — daily 7am digest + 30min bridge sync.');
}

// Manual test helpers
function testSendCheckIn()   { Debbie.sendCheckIn(); }
function testBridgeSync()    { Bridge.sync(); }
function testProcessReplies(){ Debbie.processReplies(); }
