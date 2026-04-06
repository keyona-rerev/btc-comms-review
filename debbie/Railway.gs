/**
 * Railway.gs — BTC-scoped Railway API client for Debbie.
 * Identical auth pattern to Phoebe's Railway.gs.
 * All reads filtered to BTC venture where supported.
 */

const Railway = (() => {
  const BASE = 'https://super-connector-api-production.up.railway.app';

  function _key() {
    const k = PropertiesService.getScriptProperties().getProperty('SC_API_KEY');
    if (!k) throw new Error('SC_API_KEY not set in Script Properties');
    return k;
  }

  function _req(method, path, payload) {
    const opts = {
      method,
      muteHttpExceptions: true,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': _key() }
    };
    if (payload) opts.payload = JSON.stringify(payload);
    const res  = UrlFetchApp.fetch(BASE + path, opts);
    const body = JSON.parse(res.getContentText());
    if (body.error) throw new Error('Railway error on ' + path + ': ' + JSON.stringify(body.error));
    return body;
  }

  // Initiatives — filter to BTC in GAS (API doesn't support venture filter param)
  function getBTCInitiatives() {
    const res = _req('get', '/initiatives');
    const all = Array.isArray(res) ? res : (res.initiatives || []);
    return all.filter(i => {
      const v = (i.venture || '').toLowerCase();
      return v === 'btc' || v === 'black tech capital';
    });
  }

  function getInitiative(id)          { return _req('get', '/initiative/' + id); }
  function updateInitiativeStatus(id, status) {
    return _req('patch', '/initiative/' + id + '/status', { status });
  }

  // Action items — filter to BTC initiatives after fetch
  function getActionItems(dueBefore) {
    return _req('get', '/action-items' + (dueBefore ? '?due_before=' + dueBefore : ''));
  }
  function createActionItem(data)     { return _req('post', '/action-item', data); }
  function updateActionItemStatus(id, status, completedDate) {
    const body = { status };
    if (completedDate) body.completed_date = completedDate;
    return _req('patch', '/action-item/' + id + '/status', body);
  }
  function updateActionItem(id, data) { return _req('put', '/action-item/' + id, data); }
  function getActionItemByGTaskId(gid){ return _req('get', '/action-item/by-google-task/' + gid); }

  // Contacts
  function upsertContact(data)        { return _req('post', '/contact', data); }
  function getContact(id)             { return _req('get', '/contact/' + id); }

  return {
    getBTCInitiatives, getInitiative, updateInitiativeStatus,
    getActionItems, createActionItem, updateActionItemStatus, updateActionItem, getActionItemByGTaskId,
    upsertContact, getContact
  };
})();
