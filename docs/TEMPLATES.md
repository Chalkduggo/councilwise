# Templates

A template sets what the council looks for: the scorecard dimensions and the default role of each member. Built-in templates are in `templates/`. Add your own by saving a JSON file in **Templates & roles → Open templates folder** (`%APPDATA%\Councilwise\templates`) and restarting the app.

```json
{
  "id": "grant-proposal",
  "name": "Grant proposal",
  "description": "Research or charity grant applications.",
  "dimensions": [
    { "id": "fit", "name": "Fit with the funder" },
    { "id": "impact", "name": "Impact" },
    { "id": "budget", "name": "Budget" },
    { "id": "feasibility", "name": "Feasibility" },
    { "id": "evaluation", "name": "Evaluation plan" }
  ],
  "sections": ["Overall verdict", "Strengths", "Critical issues", "Recommended changes", "Scorecard"],
  "defaultRoles": { "claude": "strategist", "chatgpt": "finance", "perplexity": "factchecker", "grok": "redteam" }
}
```

Role ids come from `templates/roles.json`: strategist, skeptic, finance, legal, factchecker, customer, engineer, redteam, operator, editor, risk, domain. Add new roles in a `roles.json` in the same folder.
