# Announcing Councilwise on LinkedIn

## What to attach

LinkedIn shows video and document posts more prominently than plain links, so post the **demo video** (or a carousel), and put the GitHub link in the text and in the first comment.

- **Video (best):** `Councilwise-demo.mp4`, about 30 seconds: setup, live run, "needs you", the report. Add captions in LinkedIn's video editor if you like.
- **Carousel (also great):** upload a PDF made from the screenshots in `docs/screenshots/`, in this order: 01 home → 03 new council → 04 needs you → 07 run complete → 08 report → 09 scorecard → 10 findings. LinkedIn shows a PDF upload as a swipeable carousel.
- **Image:** `docs/social-preview.png` (1280×640) also works as the post image.

## Post 1 · Launch story (recommended)

> I just open-sourced **Councilwise** — an LLM council for your documents. 🧠⚖️
>
> When a document really matters (a business plan, a contract, a strategy, a pitch), one AI's opinion isn't enough. So I built a Windows app that runs a proper review panel:
>
> 1️⃣ Eight models — Claude, Gemini, ChatGPT, Perplexity, Grok, DeepSeek, Mistral and Cohere — each review the document independently, each with a role (Strategist, Skeptic, Finance, Legal, Red Team…)
> 2️⃣ They review each other anonymously as "Reviewer A, B, C", so evidence wins, not brand names
> 3️⃣ A fact-checker verifies dates, prices and facts with live search
> 4️⃣ A Council Head rules on every dispute
> 5️⃣ A moderator checks the ruling, fixes contradictions and writes the final report
>
> You get a verdict, a confidence score you can see inside (agreement, evidence, facts, resolved disputes), a scorecard, a prioritised change list and a minority report — as PDF, Word or text.
>
> The part I'm proudest of: **no API keys.** You sign in to your own accounts (Free or Pro) inside the app, and it does the rest. Live status for every model, pause / stop / resume, and nothing leaves your PC except what goes to the models you pick.
>
> It's free and open source (MIT). There's a one-click demo that runs without signing in to anything.
>
> 👉 Download and code: https://github.com/Chalkduggo/councilwise
>
> I'd love feedback — what documents would you put in front of a council? And if a model's website changes and breaks, issues and pull requests are very welcome.
>
> #OpenSource #AI #LLM #GenerativeAI #ProductBuilding #DecisionMaking #Windows

## Post 2 · Short and punchy

> One AI = one opinion.
> Eight AIs, an anonymous peer review, a fact check, a Council Head and a moderator = a verdict you can actually trust.
>
> I built **Councilwise**, a free, open-source Windows app that runs an LLM council on any document — using your own ChatGPT, Claude, Gemini, Perplexity and other logins. No API keys.
>
> ✅ Confidence score with the maths shown
> ✅ Scorecard + disagreement map
> ✅ Change list, fact check, minority report
> ✅ PDF / Word / Text reports
>
> Try the demo (no sign-in needed): https://github.com/Chalkduggo/councilwise
>
> #AI #OpenSource #LLM #Productivity

## Post 3 · For a technical audience

> Shipped: **Councilwise 1.0**, an open-source desktop "LLM council" for document review.
>
> Under the hood:
> • Electron app; each model runs in an isolated, persistent browser profile. You log in on the provider's own page; cookies are encrypted with Windows DPAPI and passwords are never touched
> • A small automation engine with per-site JSON connectors (input, send, busy, response selectors) and generic fallbacks, so a site redesign degrades instead of breaking. Users can hot-fix a connector without a new release
> • Optional OpenAI-compatible API mode (works with OpenRouter and local Ollama)
> • Orchestrator with retries, "needs you" hand-offs, pause/stop/resume and a checkpoint after every step
> • Structured JSON output from every member, with repair prompts, so the app computes a transparent confidence score instead of trusting any single model
> • Reports rendered once and exported to PDF, DOCX, TXT and Markdown
> • Unit tests plus an end-to-end test that runs a full council against a mock chat site in CI
>
> Inspired by Andrej Karpathy's llm-council idea, extended with roles, a separate Head and moderator, fact-checking and scoring.
>
> Repo (MIT): https://github.com/Chalkduggo/councilwise
>
> #OpenSource #Electron #JavaScript #LLM #AIEngineering

## First comment (post it right after publishing)

> 🔗 GitHub (download + source): https://github.com/Chalkduggo/councilwise
> ⬇️ Windows installer: https://github.com/Chalkduggo/councilwise/releases/latest
> Tip: click "Try the demo" on the Home screen to see a full council without signing in.

## Tips

- **Post on a weekday morning** (Tuesday to Thursday, around 9–11 am in your audience's time zone) and stay around for the first hour to reply to comments. Early replies help reach.
- **Be honest about limits** in comments when asked: website automation can break when sites change (there's an API fallback and Assisted mode), and the installer isn't code-signed yet, so Windows shows a SmartScreen warning.
- **Add it to your profile:** Profile → **Add profile section → Recommended → Add projects** — name *Councilwise*, link the repo, add the social preview image, and associate it with your current position or "Independent". Also add the post to **Featured**.
- **Tag thoughtfully:** mention people who gave feedback or tested it. Avoid tagging the AI companies; their names in the text are enough.
- **Follow up a week later** with a short post: what people used it for, a stat (stars, downloads), and what's coming in 1.1 (tracked-changes Word output, masking sensitive data, comparing sessions).
- **AI pair-programming:** if you'd like to be open about how you built it, a line such as *"designed by me, built with an AI pair-programmer"* tends to land well and starts good conversations.
