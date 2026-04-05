const { Octokit } = require('@octokit/rest');
const { fetchStyleGuide, loadSkill } = require('./fetch-config');

const PROVIDER   = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
const MODEL      = process.env.LLM_MODEL || '';
const [OWNER, REPO] = (process.env.REPO || '').split('/');
const PR_NUMBER  = parseInt(process.env.PR_NUMBER);

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });


const PROVIDERS = {
  anthropic: './providers/anthropic',
  openai:    './providers/openai',
  gemini:    './providers/gemini',
};

if (!PROVIDERS[PROVIDER]) {
  console.error(`Provider desconhecido: "${PROVIDER}". Use: anthropic | openai | gemini`);
  process.exit(1);
}

const llm = require(PROVIDERS[PROVIDER]);

function parseCommentArgs(body = '') {
  const args = {};
  const model = body.match(/--model=(\S+)/);
  if (model) args.model = model[1];
  const skill = body.match(/--skill=(\S+)/);
  if (skill) args.skill = skill[1];
  const focus = body.match(/--focus=([^\-\n]+)/);
  if (focus) args.focus = focus[1].trim();
  return args;
}

async function getPRDiff() {
  const { data: files } = await octokit.pulls.listFiles({
    owner: OWNER, repo: REPO, pull_number: PR_NUMBER, per_page: 30,
  });

  const relevant = files.filter(f => f.patch);
  if (!relevant.length) throw new Error('Nenhum arquivo com diff encontrado no PR.');

  return {
    files: relevant,
    summary: `${files.length} arquivo(s) alterado(s)`,
    diff: relevant.map(f => {
      let lineNumber = 0;
      const annotated = f.patch.split('\n').map(line => {
        if (line.startsWith('@@')) {
          const m = line.match(/\+(\d+)/);
          lineNumber = m ? parseInt(m[1]) - 1 : lineNumber;
          return line;
        }
        if (!line.startsWith('-')) lineNumber++;
        return (line.startsWith('+') ? `[linha ${lineNumber}] ` : '            ') + line;
      });
      return `### 📄 ${f.filename}\n\`\`\`diff\n${annotated.join('\n')}\n\`\`\``;
    }).join('\n\n'),
  };
}

function buildPrompt({ skillContent, styleGuide, diff, summary, focus }) {
  const styleSection = styleGuide
    ? `## Style Guide do Projeto\n${styleGuide}\n`
    : '';
  const focusSection = focus
    ? `## Foco Adicional\nConcentre-se especialmente em: **${focus}**\n`
    : '';

  return `Você é um revisor de código sênior. Analise o diff abaixo e retorne APENAS um JSON válido, sem texto extra.

## Instruções de Revisão (Skill)
${skillContent}

${styleSection}
${focusSection}
## PR — ${summary}
${diff}

## Retorne APENAS este JSON (sem markdown, sem texto fora do JSON):
{
  "summary": "Resumo geral do PR em 2-3 linhas",
  "verdict": "approved | needs_changes | comment",
  "comments": [
    {
      "path": "caminho/arquivo.ts",
      "line": 42,
      "severity": "critical | warning | suggestion | praise",
      "body": "Explicação clara e construtiva"
    }
  ]
}

Regras: "line" = número [linha N] do diff | só linhas com + ou contexto | máx 20 comentários | não comente linhas com -`;
}

function parseJSON(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    console.error('JSON inválido recebido da IA:\n', raw);
    throw new Error('A IA não retornou JSON válido.');
  }
}

function severityEmoji(s) {
  return { critical: '🔴', warning: '🟡', suggestion: '🔵', praise: '✅' }[s] || '💬';
}

async function postReview({ summary, verdict, comments, meta, prFiles }) {
  const { data: pr } = await octokit.pulls.get({ owner: OWNER, repo: REPO, pull_number: PR_NUMBER });

  const valid = comments.filter(c => {
    if (!prFiles.find(f => f.filename === c.path)) {
      console.warn(`Ignorado (arquivo fora do diff): ${c.path}`); return false;
    }
    if (!c.line || isNaN(c.line)) {
      console.warn(`Ignorado (linha inválida): ${c.path}:${c.line}`); return false;
    }
    return true;
  });

  console.log(`💬 ${valid.length}/${comments.length} comentários inline válidos`);

  const skillLabel = meta.skill !== 'default' ? ` · **Skill:** \`${meta.skill}\`` : '';
  const sourceLabel = meta.styleSource ? ` · **Style:** \`${meta.styleSource}\`` : '';

  await octokit.pulls.createReview({
    owner: OWNER, repo: REPO,
    pull_number: PR_NUMBER,
    commit_id: pr.head.sha,
    body: `## 🤖 AI Code Review\n> **Provider:** \`${meta.provider}\` · **Modelo:** \`${meta.model}\`${skillLabel}${sourceLabel}\n\n${summary}`,
    event: { approved: 'APPROVE', needs_changes: 'REQUEST_CHANGES', comment: 'COMMENT' }[verdict] || 'COMMENT',
    comments: valid.map(c => ({
      path: c.path,
      line: c.line,
      body: `${severityEmoji(c.severity)} **${c.severity.toUpperCase()}**\n\n${c.body}`,
    })),
  });
}

async function main() {
  console.log(`Provider: ${PROVIDER}`);

  const args      = parseCommentArgs(process.env.COMMENT_BODY || '');
  const model     = args.model || MODEL || llm.DEFAULT_MODEL;
  const skillName = args.skill || 'default';

  console.log(`📦 Modelo: ${model} | 🎯 Skill: ${skillName}`);

  const [styleGuide, skillContent] = await Promise.all([
    fetchStyleGuide(),
    Promise.resolve(loadSkill(skillName)),
  ]);

  const styleSource =
    process.env.STYLE_GUIDE_PATH   ? process.env.STYLE_GUIDE_PATH :
    process.env.CONFLUENCE_URL     ? 'confluence' :
    process.env.STYLE_GUIDE_URL    ? 'url' : null;

  console.log(`Buscando diff do PR #${PR_NUMBER}...`);
  const { diff, summary, files: prFiles } = await getPRDiff();

  const prompt = buildPrompt({ skillContent, styleGuide, diff, summary, focus: args.focus });

  console.log(`Enviando para ${PROVIDER}...`);
  const raw = await llm.review({ model, prompt });

  const { summary: reviewSummary, verdict, comments } = parseJSON(raw);

  console.log(`Postando review inline...`);
  await postReview({
    summary: reviewSummary, verdict, comments,
    meta: { provider: PROVIDER, model, skill: skillName, styleSource },
    prFiles,
  });

  console.log(`Review postado! Veredicto: ${verdict}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
