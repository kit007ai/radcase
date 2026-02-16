class AIProvider {
  constructor(db) {
    this.db = db;
  }

  getConfig() {
    const rows = this.db.prepare('SELECT key, value FROM ai_config').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    return config;
  }

  isConfigured() {
    const config = this.getConfig();
    return !!(config.provider && config.apiKey);
  }

  async chat(systemPrompt, messages, options = {}) {
    const config = this.getConfig();
    if (!config.provider || !config.apiKey) {
      throw new Error('AI not configured. Go to Admin > AI Settings to configure.');
    }
    return this._callProvider(config, systemPrompt, messages, options);
  }

  async generate(prompt, options = {}) {
    return this.chat(
      'You are a radiology education expert creating board-exam level teaching content.',
      [{ role: 'user', content: prompt }],
      options
    );
  }

  async generateJSON(prompt, options = {}) {
    const response = await this.generate(
      prompt + '\n\nRespond with valid JSON only. No markdown, no code fences, just pure JSON.',
      { ...options, maxTokens: options.maxTokens || 4000 }
    );
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(jsonStr);
  }

  async _callProvider(config, systemPrompt, messages, options = {}) {
    const provider = config.provider.toLowerCase();
    const maxTokens = options.maxTokens || 4000;
    const temperature = options.temperature || 0.7;

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    if (provider === 'openai' || provider === 'openai-compatible') {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const model = config.model || 'gpt-4o-mini';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          max_tokens: maxTokens,
          temperature
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'API error');
      return data.choices[0].message.content;
    }

    if (provider === 'anthropic') {
      const model = config.model || 'claude-3-haiku-20240307';

      const anthropicMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: anthropicMessages
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'API error');
      return data.content[0].text;
    }

    if (provider === 'ollama') {
      const baseUrl = config.baseUrl || 'http://localhost:11434';
      const model = config.model || 'llama2';

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          stream: false
        })
      });

      const data = await response.json();
      return data.message.content;
    }

    throw new Error(`Unknown AI provider: ${provider}`);
  }
}

module.exports = AIProvider;
