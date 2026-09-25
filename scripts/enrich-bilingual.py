import json

TOOLS_PATH = 'src/data/tools.json'
DOSSIERS_PATH = 'src/data/dossiers.json'

tools = json.load(open(TOOLS_PATH, 'r', encoding='utf-8'))

EN_DATA = {
  1: {
    "job_en": "Detect accessibility barriers in Figma, browser, or dev workflows prior to release",
    "why_en": "Transforms accessibility into an active QA milestone rather than a late-stage checklist",
    "caveat_en": "Automated audits do not replace testing with affected individuals or legal counsel."
  },
  2: {
    "job_en": "Maintain consistent UX copy across product surfaces, tonality, and localizations",
    "why_en": "Great UI often stumbles on microcopy; structures copy systematically instead of ad-hoc AI phrasing",
    "caveat_en": "Requires an actively maintained glossary and committed content decisions across the team."
  },
  3: {
    "job_en": "Synthesize customer interviews and feedback into traceable, actionable product signals",
    "why_en": "Far more than transcript summarization: user research remains permanently discoverable as evidence",
    "caveat_en": "Superficial or flawed research will not become valid simply through AI synthesis."
  },
  4: {
    "job_en": "Rapidly search, bookmark, and tag user interview recordings with full context",
    "why_en": "Eliminates tedious transcription and manual tagging while keeping clips and raw context verifiable",
    "caveat_en": "Speaker attribution and conversational nuances still require periodic spot-checks."
  },
  5: {
    "job_en": "Test interactive prototypes and uncover empirical patterns in user drop-offs",
    "why_en": "Enforces real user behavioral feedback instead of gut-feeling design decisions",
    "caveat_en": "A sleek report cannot compensate for poorly structured task prompts or mismatched cohorts."
  },
  6: {
    "job_en": "Conduct rapid user tests, preference audits, and targeted feedback surveys",
    "why_en": "Falsifies early design assumptions before committing to expensive production engineering",
    "caveat_en": "Panel composition and sampling quality entirely dictate statistical confidence."
  },
  7: {
    "job_en": "Simulate visual attention and gaze distribution across landing pages and interfaces",
    "why_en": "Surfaces visual hierarchy flaws early; serves as an empirical counterweight to purely aesthetic taste",
    "caveat_en": "Predictive heatmaps represent algorithmic hypotheses, not empirical laboratory eye-tracking."
  },
  8: {
    "job_en": "Document design system standards so engineering and design teams actually adopt them",
    "why_en": "The anti-slop lever: living components, states, and rules over single-use generated screens",
    "caveat_en": "Without dedicated ownership, documentation turns into a visually pleasing ghost town."
  },
  9: {
    "job_en": "Manage tokens, component knowledge, and system documentation as a standalone product",
    "why_en": "Makes design system engineering exportable and audit-proof rather than copy-paste glue",
    "caveat_en": "Only delivers leverage on an already cohesive architecture; AI does not untangle structural chaos."
  },
  10: {
    "job_en": "Unify production components and living design system documentation in a single workspace",
    "why_en": "Tethers design context and AI directly to real production components",
    "caveat_en": "Built primarily for enterprise engineering teams rather than solo developers."
  },
  11: {
    "job_en": "Structure information architecture and wireframes prior to assembling component grids",
    "why_en": "A rare generative system where structural hierarchy precedes visual styling",
    "caveat_en": "Brand character, bespoke editorial rhythm, and edge cases still require bespoke craft."
  },
  12: {
    "job_en": "Compile existing Figma design decisions into clean, editable production code",
    "why_en": "Superior to prompt-to-UI because an intentional, validated design artifact is the baseline",
    "caveat_en": "Output is a starting foundation: component APIs, accessibility, and fluid layouts need human review."
  },
  13: {
    "job_en": "Audit pull requests with context-aware code reviews prior to merging",
    "why_en": "Integrates directly into existing PR gates rather than forcing developers into another IDE",
    "caveat_en": "Comments are advisory; repository permissions, data access, and false positives need active calibration."
  },
  14: {
    "job_en": "Query complex codebases and validate proposed changes against full repository context",
    "why_en": "Addresses the true engineering bottleneck: multi-file dependency context, not inline auto-complete",
    "caveat_en": "Index permissions must be tightly guarded; critical architectural proposals require peer verification."
  },
  15: {
    "job_en": "Review pull requests against team conventions, commit intent, and stack rules",
    "why_en": "Ideal companion for teams shipping high volumes of stacked, bite-sized pull requests",
    "caveat_en": "Does not replace human accountability on high-risk domain logic or migration paths."
  },
  16: {
    "job_en": "Generate specification-grounded test suites and rigorous engineering reviews",
    "why_en": "High leverage because it anchors AI to verification and tests rather than unconstrained implementation",
    "caveat_en": "Generated tests can inadvertently codify and assert incorrect contract behavior."
  },
  17: {
    "job_en": "Automate recurring PR hygiene checks, minor fixes, and repository maintenance",
    "why_en": "Turns routine maintenance and small fixes into reproducible background runs",
    "caveat_en": "Must be constrained to narrow tasks; never allow automated auto-merging on production branches."
  },
  18: {
    "job_en": "Detect and triage security vulnerabilities and code smells using deterministic rules",
    "why_en": "Rule logic remains auditable and deterministic; a rigorous counterweight to non-deterministic AI reviews",
    "caveat_en": "Rule sets and severity thresholds require project-specific tuning to avoid notification fatigue."
  },
  19: {
    "job_en": "Consolidate and prioritize security vulnerabilities into actionable developer tasks",
    "why_en": "Filters out scanner noise to highlight real, exploitable risk vectors",
    "caveat_en": "Compliance certification, coverage scope, and remediations cannot be blindly abdicated to a tool."
  },
  20: {
    "job_en": "Author and maintain resilient end-to-end browser tests based on user intent",
    "why_en": "Anchors test suites to real user journeys and DOM states rather than brittle unit selectors",
    "caveat_en": "Mission-critical payment and auth flows still require deterministic state assertions."
  },
  21: {
    "job_en": "Catch visual and functional regressions early using recorded real user execution paths",
    "why_en": "Shifts QA from hoping manual testers catch edge cases to comprehensive behavioral replays",
    "caveat_en": "Sanitizing sensitive user data, test isolation, and flakiness triage are non-negotiable."
  },
  22: {
    "job_en": "Inject version-accurate library documentation directly into coding agent contexts",
    "why_en": "Eliminates a primary hallucination source: generating code based on deprecated or fabricated APIs",
    "caveat_en": "Documentation can still contain ambiguities; always cross-reference source releases when in doubt."
  },
  23: {
    "job_en": "Answer engineering architectural questions grounded in codebase and team documentation",
    "why_en": "Superb for developer onboarding and contextual understanding, far beyond simple code generation",
    "caveat_en": "Knowledge fidelity depends entirely on access permissions and indexing freshness."
  },
  24: {
    "job_en": "Analyze and manipulate CSV/Excel datasets with reproducible, visible Python scripts",
    "why_en": "Inspectable code execution: inspect both the methodology and the output rather than a black-box answer",
    "caveat_en": "Data sanitization, outlier handling, and causal interpretations remain your responsibility."
  },
  25: {
    "job_en": "Execute AI enrichment steps directly inside a collaborative spreadsheet workflow",
    "why_en": "The spreadsheet remains the inspectable source of truth, not an ephemeral chat prompt",
    "caveat_en": "Always audit formula derivations and external data sources for mission-critical business logic."
  },
  26: {
    "job_en": "Explore tabular business data and formulate predictive models without custom notebooks",
    "why_en": "Lowers friction for data exploration without necessitating a dedicated data science infrastructure",
    "caveat_en": "Model reliability depends ruthlessly on feature hygiene, sample size, and target leakage checks."
  },
  27: {
    "job_en": "Inspect and filter massive tabular datasets in an intuitive spreadsheet-style interface",
    "why_en": "Solves an acute operational pain point: datasets too heavy for Excel to handle comfortably",
    "caveat_en": "Never confuse statistical certainty with an eloquently phrased natural language summary."
  },
  28: {
    "job_en": "Transform spreadsheet data operations into clean, reproducible Python data pipelines",
    "why_en": "Bridges the gap between rapid interactive exploration and production-grade maintenance",
    "caveat_en": "Generated code must be tested and aligned to organizational code standards."
  },
  29: {
    "job_en": "Discover and synthesize academic literature for specific research questions with structured claims",
    "why_en": "Substantially more rigorous than web search when study comparisons and evidence matrices matter",
    "caveat_en": "Reading primary papers remains mandatory; database coverage is never fully exhaustive."
  },
  30: {
    "job_en": "Map citation graphs, co-authors, and conceptual descendants around seminal papers",
    "why_en": "Exceptional discovery engine for uncovering actual intellectual lineages and related work",
    "caveat_en": "A citation network represents academic attention, not an endorsement of methodological validity."
  },
  31: {
    "job_en": "Deconstruct complex academic passages and equations directly within document context",
    "why_en": "Far more grounded than reading abstract summaries stripped of primary document context",
    "caveat_en": "Cross-reference mathematical derivations and causal claims against textbooks and peer reviews."
  },
  32: {
    "job_en": "Index and query extensive technical documents in a connected, searchable workspace",
    "why_en": "Invaluable for contracts, regulatory dossiers, and extensive multi-source research binders",
    "caveat_en": "Always verify against cited passages; AI synthesis does not constitute legal or technical proof."
  },
  33: {
    "job_en": "Deploy internal assistants grounded in authorized team repositories and SaaS tools",
    "why_en": "Permissions, human oversight, and verifiable citations are baked directly into the orchestration layer",
    "caveat_en": "Connector hygiene and data governance roles must be audited prior to organization-wide rollout."
  },
  34: {
    "job_en": "Capture unstructured thoughts as schema-driven supertags and queryable knowledge graphs",
    "why_en": "Preserves conceptual structure and mental models instead of burying thoughts in linear chat history",
    "caveat_en": "Steep initial learning curve; without disciplined capture habits, it risks becoming overhead."
  },
  35: {
    "job_en": "Annotate articles and PDFs, synthesize arguments, and interrogate sources in context",
    "why_en": "Significantly more durable for deep reading workflows than fleeting summarizers or generic notes",
    "caveat_en": "Does not replace rigorous critical reading habits or active source interrogation."
  },
  36: {
    "job_en": "Construct multi-stage automation workflows connecting enterprise SaaS tools with visible state",
    "why_en": "Exposes every operational step and data transformation instead of relying on opaque agentic magic",
    "caveat_en": "Error handling, branch retries, and API credit limits must be deliberately architected."
  },
  37: {
    "job_en": "Orchestrate automations with mandatory human approvals between critical AI execution steps",
    "why_en": "The human-in-the-loop paradigm prevents catastrophic runaway agent hallucinations",
    "caveat_en": "Approval steps must be treated as serious gates, not rubber-stamped out of alert fatigue."
  },
  38: {
    "job_en": "Engineer and stress-test interactive conversational voice bots with stateful logic",
    "why_en": "Models conversational flow, fallback escalation, and latency metrics as first-class engineering",
    "caveat_en": "Consent disclosures, edge-case routing, and hallucination containment must be proven in staging."
  },
  39: {
    "job_en": "Compose and iterate across multiple generative image models in a unified visual canvas",
    "why_en": "Keeps reference inspiration, prompt variations, and lineage decisions visually organized",
    "caveat_en": "Multi-model experimentation does not automatically produce cohesive, art-directed branding."
  },
  40: {
    "job_en": "Curate visual moodboards and asset libraries to establish contextual foundations for creative projects",
    "why_en": "High visual quality begins with curated references and intentional curation, not prompt roulette",
    "caveat_en": "Asset usage rights, licensing parameters, and file nomenclature must be managed manually."
  },
  41: {
    "job_en": "Transform industrial and product sketches into controllable, photo-rendered concepts",
    "why_en": "Far more purposeful than generic text-to-3D: designer sketches dictate geometry and perspective",
    "caveat_en": "Not an engineering or CAD deliverable; physical manufacturing feasibility must be checked independently."
  },
  42: {
    "job_en": "Generate cohesive cinematic storyboards before committing budget to video production",
    "why_en": "Saves substantial capital by locking narrative beats and framing prior to shooting or rendering",
    "caveat_en": "Storyboard quality remains downstream of screenwriting fundamentals and visual grammar."
  },
  43: {
    "job_en": "Orchestrate script, shot lists, character continuity, and editing in a pre-production suite",
    "why_en": "Provides production predictability rather than generating disconnected, uneditable video clips",
    "caveat_en": "Character facial fidelity across lighting shifts and final cuts still demand hands-on curation."
  },
  44: {
    "job_en": "Produce narrative audio and video explainers from verified scripts with synchronized pacing",
    "why_en": "High utility when speech cadence, vocal timbre, and scene transitions can be edited deterministically",
    "caveat_en": "Pronunciation nuances, factual assertions, and commercial licensing must be formally verified."
  },
  45: {
    "job_en": "Eliminate filler words, acoustic stutter, and dead air prior to the editorial cut",
    "why_en": "A targeted post-production lever with a clear, verifiable before-and-after improvement",
    "caveat_en": "Aggressive filtering can strip natural cadence, emotional breath, and conversational warmth."
  },
  46: {
    "job_en": "Balance broadcast loudness, EQ dynamics, and audio consistency for publishing delivery",
    "why_en": "Unflashy but indispensable: professional acoustic clarity and compliance over AI parlor tricks",
    "caveat_en": "Cannot salvage compromised source recordings, distorted microphones, or poor room acoustics."
  },
  47: {
    "job_en": "Synthesize study material into networked concept notes and spaced-repetition flashcards",
    "why_en": "Reinforces knowledge retention through active recall rather than passive consumption of summaries",
    "caveat_en": "Poorly formulated cards yield poor retention; true conceptual mastery cannot be outsourced."
  },
  48: {
    "job_en": "Practice conversational language fluency through real-time dialogue and corrective feedback",
    "why_en": "Forces active verbal output and sentence formation rather than passive vocabulary memorization",
    "caveat_en": "Nuanced idiomatic pragmatics and spontaneous cultural banter remain limited in synthetic tutors."
  },
  49: {
    "job_en": "Refine written prose for tone, precision, and clarity while preserving the author's intent",
    "why_en": "Far more constructive than generic rewriting when you want to protect your authentic voice",
    "caveat_en": "Never accept suggestions uncritically; safeguard specialized technical terms and stylistic intent."
  },
  50: {
    "job_en": "Transcribe spoken voice memos rapidly and retrieve them with contextual search",
    "why_en": "Eliminates cognitive friction in idea capture; ideal for worklogs, debriefs, and spontaneous thoughts",
    "caveat_en": "Review privacy policies, retention defaults, and team data sharing before logging sensitive data."
  },
  51: {
    "job_en": "Expose production design system components, stories, and props directly to coding agents",
    "why_en": "Agents reference actual production components and verified stories rather than hallucinating ad-hoc UI",
    "caveat_en": "Currently in developer preview and optimized primarily for React and TypeScript ecosystems."
  },
  52: {
    "job_en": "Detect component-level accessibility flaws, suggest code remedies, and generate test specs",
    "why_en": "Integrates accessibility analysis and unit assertions directly into developer workflows",
    "caveat_en": "Automated scanners cannot evaluate full WCAG usability or screen reader ergonomics."
  },
  53: {
    "job_en": "Execute guided accessibility inspections and intelligent audits alongside automated scans",
    "why_en": "Steers developers toward actionable manual inspection points rather than misleading '100% passed' badges",
    "caveat_en": "Performance gains are vendor claims; hands-on assistive technology testing remains mandatory."
  },
  54: {
    "job_en": "Assert visual parity between canonical Figma design files and production browser builds",
    "why_en": "Catches subtle styling drift, line-height anomalies, and spacing regressions before deployment",
    "caveat_en": "Visual parity does not constitute comprehensive UX validation or functional accessibility."
  },
  55: {
    "job_en": "Prioritize visual regressions using DOM state context and functional test execution data",
    "why_en": "Filters out benign pixel noise to surface actionable regressions during test runs",
    "caveat_en": "Disciplined test suite authoring and engineering release sign-off remain indispensable."
  },
  56: {
    "job_en": "Synthesize and execute Java and Kotlin unit test suites directly in IDE or CI pipelines",
    "why_en": "Outputs standard, committable JUnit test files rather than unverifiable chatbot snippets",
    "caveat_en": "Specialized for Java/Kotlin; intricate enterprise runtimes require thorough setup and review."
  },
  57: {
    "job_en": "Generate verifiable code patches for static analysis violations detected by SonarQube",
    "why_en": "Anchors AI suggestions directly to deterministic, rule-based static analysis findings",
    "caveat_en": "Enterprise/Data Center license tier required on server; every suggested patch demands test execution."
  },
  58: {
    "job_en": "Remediate static analysis findings and security vulnerabilities with automated pull requests",
    "why_en": "Combines deterministic code scanning with verifiable, reviewable remediation branches",
    "caveat_en": "Suggested fixes do not guarantee architectural correctness; peer review and test suites are required."
  },
  59: {
    "job_en": "Develop collaborative analysis notebooks unifying SQL, Python, and interactive charts",
    "why_en": "Agent generates or fixes cells, but the deliverable remains a reproducible, inspectable notebook",
    "caveat_en": "Geared toward modern data teams; SQL transformations and metric definitions still require review."
  },
  60: {
    "job_en": "Generate governance-compliant SQL and BI visualizations from enterprise databases",
    "why_en": "Enforces an explicit business semantic model to prevent the hallucinations common to raw text-to-SQL",
    "caveat_en": "Delivers genuine leverage only when supported by a rigorously maintained semantic layer."
  },
  61: {
    "job_en": "Deploy source-grounded technical support and documentation agents across product channels",
    "why_en": "Answers strictly cite indexed product documentation rather than relying on ungrounded model weights",
    "caveat_en": "Answer fidelity is strictly capped by documentation freshness, completeness, and indexing scope."
  },
  62: {
    "job_en": "Perform permission-aware enterprise search across internal repositories, chats, and wikis",
    "why_en": "Responses cite verifiable references while strictly honoring source ACLs and security boundaries",
    "caveat_en": "Enterprise deployment requires meticulous connector setup and continuous data governance audits."
  },
  63: {
    "job_en": "Integrate custom document knowledge bases into triggered enterprise automation workflows",
    "why_en": "Knowledge retrieval operates as an explicit, auditable workflow node connected to execution actions",
    "caveat_en": "RAG pipelines demand systematic evaluation; chunking, retrieval calibration, and prompting require care."
  },
  64: {
    "job_en": "Convert standard video recordings into 3D character motion capture for Unreal and Blender",
    "why_en": "Produces editable, retargetable motion curves rather than locked generative video clips",
    "caveat_en": "Ground contact, limb occlusion, and fast rotations require manual cleanup in 3D suites."
  },
  65: {
    "job_en": "Restore, denoise, and upscale archival or low-resolution video assets for production pipelines",
    "why_en": "Processes existing master footage as a production asset without generative hallucinations",
    "caveat_en": "Compute-heavy; extreme upscaling can generate uncanny artifacts or over-smoothed textures."
  },
  66: {
    "job_en": "Synthesize meeting notes with transcript context into crisp decisions and actionable follow-ups",
    "why_en": "Human notes remain the editorial anchor; AI enriches context rather than acting as a noisy bot",
    "caveat_en": "Obtain attendee consent; verify compliance, retention, and storage when handling confidential meetings."
  },
  67: {
    "job_en": "Defend focus blocks, task time, and flexible meetings against calendar conflicts",
    "why_en": "Solves an acute operational bottleneck—finite calendar time—rather than creating another to-do list",
    "caveat_en": "Requires clear task prioritization and team adoption of calendar conventions to remain effective."
  },
  68: {
    "job_en": "Extract structured competitor, price, inventory, and job board changes from web targets",
    "why_en": "A trained robot pipes clean, structured diffs directly into APIs or spreadsheets on schedule",
    "caveat_en": "Respect site terms, robots.txt, and rate limits; target DOM layout changes can break extraction rules."
  },
  69: {
    "job_en": "Process complex document archives like invoices and due diligence binders into structured audits",
    "why_en": "Engineered for document-dense enterprise processes with audit trails, tables, and human review gates",
    "caveat_en": "Demands representative validation datasets and human verification; enterprise-only sales model."
  },
  70: {
    "job_en": "Draft, negotiate, and audit commercial contracts against corporate precedent and risk policies",
    "why_en": "Specialized for contractual clauses and institutional legal knowledge rather than generic text prompts",
    "caveat_en": "Enterprise legal tool; does not provide formal legal counsel or replace attorney sign-off."
  },
  71: {
    "job_en": "Deep codebase refactoring, extended analytical reasoning, and interactive UI prototypes",
    "why_en": "Industry-leading extended context comprehension, nuanced code syntax, and steerable artifacts",
    "caveat_en": "Rate limits on high tiers can be reached during heavy CLI sessions; require disciplined context scoping."
  },
  72: {
    "job_en": "Multimodal analysis across images, complex documents, and ad-hoc operational inquiries",
    "why_en": "Extensive ecosystem with dependable multimodal tools, advanced voice, and browser-native workflows",
    "caveat_en": "Occasional hallucinations on obscure APIs; enterprise data requires verified privacy opt-outs."
  },
  73: {
    "job_en": "Real-time search synthesis linking every assertion to verifiable, clickable primary sources",
    "why_en": "Replaces tedious search result wading with synthesized answers supported by inspectable citations",
    "caveat_en": "Can cite SEO-optimized content farms; primary source verification remains mandatory."
  },
  74: {
    "job_en": "High-fidelity visual concept art and aesthetic ideation with superior lighting and texture",
    "why_en": "The benchmark for cinematic lighting, visual coherence, and aesthetic exploration in creative teams",
    "caveat_en": "Challenging for exact typographical placement or pixel-grid UI; lacks native layer editing."
  },
  75: {
    "job_en": "Generative cinematic video and motion scenes (Gen-3) for film, visual effects, and social assets",
    "why_en": "Leading temporal coherence, director-level camera control, and motion brushing capabilities",
    "caveat_en": "High credit consumption; physical consistency can drift during rapid object interactions."
  },
  76: {
    "job_en": "Generate responsive slide decks, memos, and visual briefs from raw outlines and notes",
    "why_en": "Constructs polished, responsive card decks in seconds rather than wrestling with PowerPoint templates",
    "caveat_en": "Stylistic flexibility is bounded by Gamma's layout cards; complex bespoke vector design is constrained."
  },
  77: {
    "job_en": "Physics-aware character animation and video motion retargeting for creative assets",
    "why_en": "Enables controllable motion transfer onto arbitrary character models without manual 3D rigging",
    "caveat_en": "Output resolution and boundary artifacts around limbs frequently require post-production masking."
  },
  78: {
    "job_en": "Upscale low-resolution imagery with controllable high-frequency texture hallucination",
    "why_en": "Breathes photorealistic micro-details and textures into assets where none existed in the source",
    "caveat_en": "Aggressive creativity parameters will hallucinate unintended facial features and distorted logos."
  },
  79: {
    "job_en": "Private AI chat across frontier models without user tracking, accounts, or telemetry retention",
    "why_en": "Free, zero-logging gateway for confidential queries and rapid model comparisons without data silos",
    "caveat_en": "Session history is strictly ephemeral; closing the browser tab purges conversation logs permanently."
  }
}

# Update tools.json
for t in tools:
    num = t['number']
    if num in EN_DATA:
        t['job_en'] = EN_DATA[num]['job_en']
        t['why_en'] = EN_DATA[num]['why_en']
        t['caveat_en'] = EN_DATA[num]['caveat_en']

with open(TOOLS_PATH, 'w', encoding='utf-8') as f:
    json.dump(tools, f, indent=2, ensure_ascii=False)

print(f"Updated {len(tools)} tools with bilingual fields in {TOOLS_PATH}")
