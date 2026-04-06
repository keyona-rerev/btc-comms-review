/**
 * Data.gs — BTC data layer for Debbie.
 * Reads from Railway only. Filters to BTC venture.
 */

const Data = {
  CACHE_KEY: 'debbie_btc',
  CACHE_TTL: 600,

  _cacheGet() {
    try { const v = CacheService.getScriptCache().get(this.CACHE_KEY); return v ? JSON.parse(v) : null; }
    catch(e) { return null; }
  },
  _cachePut(data) {
    try { CacheService.getScriptCache().put(this.CACHE_KEY, JSON.stringify(data), this.CACHE_TTL); }
    catch(e) { Logger.log('Cache write failed: ' + e.message); }
  },
  _cacheBust() {
    try { CacheService.getScriptCache().remove(this.CACHE_KEY); } catch(e) {}
  },

  getBTCInitiatives() {
    return Railway.getBTCInitiatives();
  },

  // All action items, then filtered to BTC initiative IDs
  getBTCActionItems() {
    const initiatives = this.getBTCInitiatives();
    const btcIds = new Set(initiatives.map(i => i.initiative_id));
    const res = Railway.getActionItems();
    const all = Array.isArray(res) ? res : (res.action_items || []);
    return all.filter(a => btcIds.has(a.initiative_id) || (a.initiative_id || '').toLowerCase().includes('btc'));
  },

  getOverdueItems() {
    const now = new Date().toISOString().substring(0, 10);
    const items = this.getBTCActionItems();
    return items.filter(a => a.status !== 'Complete' && a.due_date && a.due_date.substring(0, 10) <= now);
  },

  getTopPriorities(limit) {
    limit = limit || 3;
    const initiatives = this.getBTCInitiatives();
    const pScore = { Critical: 5, High: 4, Medium: 3, Low: 2, Parked: 0 };
    const sScore = { Active: 5, Planning: 3, 'Brain Dump': 1, Paused: 1, Complete: 0 };
    return initiatives
      .filter(i => i.status !== 'Complete' && i.status !== 'Paused')
      .map(i => ({ ...i, _score: (pScore[i.priority] || 0) + (sScore[i.status] || 0) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score, ...rest }) => rest);
  }
};
