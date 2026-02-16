class ReferenceEnrichment {
  constructor() {
    this.cache = new Map();
  }

  async searchPubMed(query, maxResults = 5) {
    const cacheKey = `pubmed:${query}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    const ids = searchData.esearchresult && searchData.esearchresult.idlist;
    if (!ids || ids.length === 0) return [];

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();

    const results = [];
    for (const id of ids) {
      const article = summaryData.result && summaryData.result[id];
      if (!article) continue;

      const authors = article.authors
        ? article.authors.slice(0, 3).map(a => a.name).join(', ')
        : '';

      results.push({
        title: article.title || '',
        authors,
        journal: article.fulljournalname || article.source || '',
        year: article.pubdate ? article.pubdate.substring(0, 4) : '',
        pmid: id,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source_type: 'journal',
        quality_tier: 'gold',
        quality_score: 5,
        citation: `${authors}. ${article.title}. ${article.source || ''}. ${article.pubdate || ''}.`
      });
    }

    this.cache.set(cacheKey, results);
    return results;
  }

  async searchRadiopaedia(query) {
    const cacheKey = `radiopaedia:${query}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const searchUrl = `https://radiopaedia.org/api/v1/searches/results?q=${encodeURIComponent(query)}&scope=articles&lang=us`;
      const res = await fetch(searchUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) return [];

      const data = await res.json();
      const articles = Array.isArray(data) ? data.slice(0, 5) : [];

      const results = articles.map(article => ({
        title: article.title || article.name || query,
        url: article.url || `https://radiopaedia.org/articles/${encodeURIComponent(query.replace(/\s+/g, '-').toLowerCase())}`,
        source_type: 'reference',
        source: 'radiopaedia',
        quality_tier: 'silver',
        quality_score: 4,
        citation: `Radiopaedia.org - ${article.title || query}`
      }));

      this.cache.set(cacheKey, results);
      return results;
    } catch (e) {
      // Graceful degradation if Radiopaedia API fails
      return [];
    }
  }

  async enrichCase(diagnosis, modality, bodyPart, findings) {
    const pubmedQuery = `${diagnosis} ${modality} ${bodyPart} radiology`;
    const results = [];

    try {
      const pubmed = await this.searchPubMed(pubmedQuery);
      results.push(...pubmed);
    } catch (e) { /* graceful degradation */ }

    try {
      const rp = await this.searchRadiopaedia(diagnosis);
      results.push(...rp);
    } catch (e) { /* graceful degradation */ }

    return results.sort((a, b) => b.quality_score - a.quality_score);
  }

  getQualityTier(source) {
    const tiers = {
      'pubmed': { tier: 'gold', score: 5 },
      'radiopaedia': { tier: 'silver', score: 4 },
      'acr': { tier: 'gold', score: 5 },
      'default': { tier: 'unverified', score: 1 }
    };
    return tiers[source] || tiers.default;
  }
}

module.exports = ReferenceEnrichment;
