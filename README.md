# 🤖 AI Code Reviewer — GitHub Action

Action reutilizável para revisão automática de PRs com IA.
Acionada por `@codeReviewer` em comentários. Suporta Claude, GPT-4 e Gemini.

---

## Uso em qualquer projeto

```yaml
# .github/workflows/code-review.yml
name: AI Code Review

on:
  issue_comment:
    types: [created]

jobs:
  review:
    if: |
      github.event.issue.pull_request != null &&
      contains(github.event.comment.body, '@codeReviewer')
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      issues: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: renan1fps/ai-code-reviewer@v1
        with:
          llm_provider: anthropic
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          style_guide_path: './docs/style-guide.md'
```

---

## Inputs

### LLM

| Input | Padrão | Descrição |
|---|---|---|
| `llm_provider` | `anthropic` | `anthropic` · `openai` · `gemini` |
| `llm_model` | _(padrão do provider)_ | Modelo específico |
| `anthropic_api_key` | — | API Key Anthropic |
| `openai_api_key` | — | API Key OpenAI |
| `gemini_api_key` | — | API Key Gemini |

### Style Guide — passe apenas UM

| Input | Descrição |
|---|---|
| `style_guide_path` | Arquivo local no repo: `./docs/style-guide.md` |
| `confluence_url` | URL de página do Confluence |
| `confluence_user` | Email do usuário Confluence |
| `confluence_token` | API Token do Confluence |
| `style_guide_url` | URL genérica (Notion, Gitbook, GitHub raw...) |

### Skills

| Input | Descrição |
|---|---|
| `skills_path` | Pasta com skills customizadas no repo. Se vazio, usa skills padrão. |

---

## Skills disponíveis (padrão)

| Skill | Uso |
|---|---|
| `default` | Revisão geral de boas práticas |
| `security` | Vulnerabilidades, OWASP, injeções |
| `performance` | N+1, cache, re-renders, bundle |
| `tests` | Cobertura, assertions, mocks |
| `accessibility` | ARIA, semântica, contraste, teclado |

### Criando skills customizadas

Crie uma pasta no seu projeto com arquivos `.md`:

```
engineering/
  review-skills/
    default.md       ← sobrescreve a skill padrão
    backend.md       ← skill exclusiva do seu projeto
    mobile.md
```

```yaml
with:
  skills_path: './engineering/review-skills'
```

---

## Como acionar

```
@codeReviewer
@codeReviewer --skill=security
@codeReviewer --model=gpt-4o --skill=performance
@codeReviewer --skill=tests --focus=edge cases
```

---

## Configurando secrets

Os secrets podem ser configurados no nível do repositório ou da organização:

**Repositório:** `Settings → Secrets and variables → Actions`

**Organização:** `Settings → Secrets → Actions` _(compartilhado com todos os repos)_

> Dica: coloque as API Keys como secrets da organização para não precisar configurar em cada repo.

---

## Publicando como Action privada

1. Crie o repo `seu-org/ai-code-reviewer`
2. Marque como **Internal** (visível pra todos da org) ou **Private**
3. Em cada projeto, use `uses: seu-org/ai-code-reviewer@v1`
4. Crie uma tag `v1` no repo da action: `git tag v1 && git push --tags`
