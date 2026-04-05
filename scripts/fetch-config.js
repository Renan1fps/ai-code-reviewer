const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

/**
 * Retorna o conteúdo do style guide.
 * Prioridade: style_guide_path > confluence_url > style_guide_url > vazio
 */
async function fetchStyleGuide() {
  const {
    STYLE_GUIDE_PATH,
    CONFLUENCE_URL,
    CONFLUENCE_TOKEN,
    CONFLUENCE_USER,
    STYLE_GUIDE_URL,
    GITHUB_WORKSPACE,
  } = process.env;

  if (STYLE_GUIDE_PATH) {
    return loadLocalFile(STYLE_GUIDE_PATH, GITHUB_WORKSPACE);
  }

  if (CONFLUENCE_URL) {
    return fetchConfluencePage(CONFLUENCE_URL, CONFLUENCE_USER, CONFLUENCE_TOKEN);
  }

  if (STYLE_GUIDE_URL) {
    return fetchUrl(STYLE_GUIDE_URL);
  }

  console.warn('Nenhuma fonte de style guide configurada. Revisão sem regras customizadas.');
  return '';
}

function loadAllSkills() {
  const { SKILLS_PATH, GITHUB_WORKSPACE } = process.env;

  if (SKILLS_PATH) {
    const skillsDir = path.resolve(GITHUB_WORKSPACE || '.', SKILLS_PATH);

    if (!fs.existsSync(skillsDir)) {
      console.warn(`⚠️  skills_path não encontrado: ${skillsDir}`);
      return loadDefaultSkill();
    }

    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));

    if (!files.length) {
      console.warn(`⚠️  Nenhum .md encontrado em ${skillsDir}`);
      return loadDefaultSkill();
    }

    console.log(`🎯 Skills carregadas: ${files.join(', ')}`);

    return files
        .map(file => {
          const name = file.replace('.md', '');
          const content = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
          return `## Skill: ${name}\n${content}`;
        })
        .join('\n\n---\n\n');
  }

  return loadDefaultSkill();
}

function loadDefaultSkill() {
  const defaultPath = path.join(__dirname, 'skills', 'default.md');
  if (fs.existsSync(defaultPath)) {
    console.log('Skill padrão carregada: default');
    return fs.readFileSync(defaultPath, 'utf-8');
  }
  console.warn('⚠️  Nenhuma skill encontrada.');
  return '';
}

function loadLocalFile(filePath, workspace = '.') {
  const resolved = path.resolve(workspace, filePath);
  if (!fs.existsSync(resolved)) {
    console.warn(`Arquivo de style guide não encontrado: ${resolved}`);
    return '';
  }
  console.log(`Style guide carregado: ${resolved}`);
  return fs.readFileSync(resolved, 'utf-8');
}

/**
 * Busca uma página do Confluence via REST API v2.
 * Suporta tanto Cloud (atlassian.net) quanto Server/Data Center.
 *
 * Exemplos de URL aceitas:
 *   https://empresa.atlassian.net/wiki/spaces/ENG/pages/123456789
 *   https://confluence.empresa.com/display/ENG/Style+Guide
 */
async function fetchConfluencePage(url, user, token) {
  console.log(`📋 Buscando style guide do Confluence: ${url}`);

  try {
    const pageId = extractConfluencePageId(url);
    const baseUrl = extractConfluenceBaseUrl(url);

    let apiUrl, authHeader;

    if (url.includes('atlassian.net')) {
      apiUrl = `${baseUrl}/wiki/rest/api/content/${pageId}?expand=body.storage`;
      const credentials = Buffer.from(`${user}:${token}`).toString('base64');
      authHeader = `Basic ${credentials}`;
    } else {
      apiUrl = `${baseUrl}/rest/api/content/${pageId}?expand=body.storage`;
      authHeader = `Bearer ${token}`;
    }

    const raw = await fetchUrl(apiUrl, { Authorization: authHeader, 'Content-Type': 'application/json' });
    const data = JSON.parse(raw);

    const html = data?.body?.storage?.value || '';
    const text = htmlToPlainText(html);

    console.log(`Confluence: ${data.title} (${text.length} chars)`);
    return `# ${data.title}\n\n${text}`;

  } catch (err) {
    console.error(`Erro ao buscar Confluence: ${err.message}`);
    return '';
  }
}

function extractConfluencePageId(url) {
  const cloudMatch = url.match(/\/pages\/(\d+)/);
  if (cloudMatch) return cloudMatch[1];

  const serverMatch = url.match(/pageId=(\d+)/);
  if (serverMatch) return serverMatch[1];

  throw new Error(`Não foi possível extrair o page ID da URL: ${url}`);
}

function extractConfluenceBaseUrl(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = { headers: { 'User-Agent': 'ai-code-reviewer/1.0', ...headers } };

    lib.get(url, options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} ao buscar ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { fetchStyleGuide, loadAllSkills  };
