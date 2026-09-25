import json
import os

TOOLS_PATH = 'src/data/tools.json'
DOSSIERS_PATH = 'src/data/dossiers.json'

tools = json.load(open(TOOLS_PATH, 'r', encoding='utf-8'))
try:
    existing = {d['id']: d for d in json.load(open(DOSSIERS_PATH, 'r', encoding='utf-8'))}
except Exception:
    existing = {}

# Tailored overrides for prominent tools
CUSTOM_DOSSIERS = {
    'claude': {
        'verdict': "Anthropic's flagship model family, unmatched in extended context reasoning, coding rigor and system-prompt fidelity.",
        'axes': [
            {'label': 'LEVERAGE', 'value': 'High'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'Medium'},
            {'label': 'PRICE', 'value': '$$'},
            {'label': 'EVIDENCE', 'value': 'Strong'},
        ],
        'bestFor': [
            'Deep multi-file codebase refactoring',
            'Complex analytical synthesis across 200k tokens',
            'Autonomous developer CLI workflows (Claude Code)',
        ],
        'caveat': 'Pro usage rate limits can be reached rapidly during continuous coding; web interface occasionally hits concurrency slowdowns.',
    },
    'chatgpt': {
        'verdict': 'The benchmark multimodal ecosystem offering broad consumer tooling, advanced voice mode, and the extensive GPT Store.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'High'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'Low'},
            {'label': 'PRICE', 'value': '$$'},
            {'label': 'EVIDENCE', 'value': 'Strong'},
        ],
        'bestFor': [
            'General multimodal queries and ideation',
            'Real-time voice conversations and translations',
            'Ad-hoc data analysis and spreadsheet charting',
        ],
        'caveat': 'Proprietary closed platform with strict filtering; enterprise data isolation requires verified business agreements.',
    },
    'perplexity': {
        'verdict': 'The definitive real-time search synthesis engine, linking each assertion to verifiable web citations.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'High'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'Medium'},
            {'label': 'PRICE', 'value': '$'},
            {'label': 'EVIDENCE', 'value': 'Strong'},
        ],
        'bestFor': [
            'Technical search with live citations',
            'Market and competitive analysis',
            'Multi-source literature aggregation',
        ],
        'caveat': 'May inadvertently cite content-farm summaries or SEO landing pages if source filters are not manually constrained.',
    },
    'midjourney': {
        'verdict': 'The industry benchmark for visual style, cinematic lighting, and aesthetic coherence in AI image generation.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'High'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'Low'},
            {'label': 'PRICE', 'value': '$$'},
            {'label': 'EVIDENCE', 'value': 'Strong'},
        ],
        'bestFor': [
            'Cinematic concept art and visual development',
            'Editorial illustrations and marketing assets',
            'Photorealistic visual exploration',
        ],
        'caveat': 'Discord and web interface lack programmable API endpoints for automated production pipelines.',
    },
    'runway': {
        'verdict': 'Premier professional generative video studio (Gen-3 Alpha) offering fine-grained camera motion and director control.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'High'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'Medium'},
            {'label': 'PRICE', 'value': '$$$'},
            {'label': 'EVIDENCE', 'value': 'Strong'},
        ],
        'bestFor': [
            'Cinematic video scene generation',
            'Motion Brush and director-level camera paths',
            'Visual effects and conceptual previz',
        ],
        'caveat': 'Credit consumption for 4K video renders is high; rapid camera trajectories can still exhibit temporal morphing.',
    },
    'gamma': {
        'verdict': 'Reinvents slide decks into fluid, responsive documents with instant typography and layout generation.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'Medium'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'Medium'},
            {'label': 'PRICE', 'value': '$'},
            {'label': 'EVIDENCE', 'value': 'Medium'},
        ],
        'bestFor': [
            'Fast pitch decks and client presentations',
            'Converting raw markdown outlines into polished slides',
            'Interactive executive summaries',
        ],
        'caveat': 'Visual design can feel generic without custom brand colors and deliberate layout overrides.',
    },
    'viggle-ai': {
        'verdict': 'Controllable physics-based character animation, transferring human dance and movement videos onto any character model.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'High'},
            {'label': 'MATURITY', 'value': 'Emerging'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'Medium'},
            {'label': 'PRICE', 'value': '$'},
            {'label': 'EVIDENCE', 'value': 'Medium'},
        ],
        'bestFor': [
            'Character rigging and video motion transfer',
            'Viral social video prototyping',
            'Fast 3D game character walk cycles',
        ],
        'caveat': 'Occluded limbs or extreme angles can cause tearing and texture detachment.',
    },
    'magnific': {
        'verdict': 'AI upscaling and detail hallucination engine that breathes ultra-crisp photographic texture into low-res assets.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'High'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'High'},
            {'label': 'PRICE', 'value': '$$$'},
            {'label': 'EVIDENCE', 'value': 'Strong'},
        ],
        'bestFor': [
            'Print-quality image upscaling up to 8K',
            'CGI and 3D render texture enhancement',
            'Ecommerce hero image sharpening',
        ],
        'caveat': 'High creativity settings invent unintended visual elements; per-upscale credit costs are steep.',
    },
    'duckduckgo': {
        'verdict': 'Private, zero-tracking AI chat portal providing free access to leading foundation models without account signups.',
        'axes': [
            {'label': 'LEVERAGE', 'value': 'Medium'},
            {'label': 'MATURITY', 'value': 'Proven'},
            {'label': 'SETUP', 'value': 'Low'},
            {'label': 'CONTROL', 'value': 'High'},
            {'label': 'PRICE', 'value': 'Free'},
            {'label': 'EVIDENCE', 'value': 'Strong'},
        ],
        'bestFor': [
            'Confidential ad-hoc technical inquiries',
            'Model comparison across Claude, GPT, and Llama without account silos',
            'Privacy-first search queries',
        ],
        'caveat': 'No persistent chat history across browser sessions; model versions are pinned to smaller/efficient tiers.',
    },
}

def clean_str(s):
    return (s or '').replace('**', '').replace('`', '').strip()

def build_axes(t):
    tid = t['id']
    cat = t.get('category', '')
    name_l = t.get('name', '').lower()
    
    # Check custom first
    if tid in CUSTOM_DOSSIERS:
        return CUSTOM_DOSSIERS[tid]['axes']
    if tid in existing:
        return existing[tid]['axes']
        
    leverage = 'High' if cat in ['Dev', 'Dev Quality', 'UI / UX', 'Data / Research', 'Creative Production', 'Daten & Quellenarbeit'] else 'Medium'
    maturity = 'Proven' if any(w in name_l for w in ['stark', 'semgrep', 'dovetail', 'maze', 'deepl', 'remnote', 'auphonic', 'storybook', 'sonarqube', 'deepsource', 'hex', 'glean', 'reclaim']) else 'Emerging'
    setup = 'Medium' if cat in ['Dev', 'Dev Quality', 'Data / Research'] else 'Low'
    if any(w in name_l for w in ['diffblue', 'meticulous', 'sonarqube', 'knapsack', 'luminance']):
        setup = 'High'
        
    control = 'High' if cat in ['Dev', 'Dev Quality', 'Daten & Quellenarbeit'] else 'Medium'
    price = '$$'
    if any(w in name_l for w in ['context7', 'explainpaper', 'researchrabbit', 'mito', 'cleanvoice', 'speak']):
        price = '$'
    if any(w in name_l for w in ['diffblue', 'applitools', 'mabl', 'luminance', 'v7 go', 'glean', 'supernova']):
        price = '$$$'
    if 'free' in t.get('job', '').lower() or 'duck' in name_l:
        price = 'Free'
        
    evidence = 'Strong' if maturity == 'Proven' or cat in ['Dev Quality', 'Daten & Quellenarbeit', 'Data / Research'] else 'Medium'
    
    return [
        {'label': 'LEVERAGE', 'value': leverage},
        {'label': 'MATURITY', 'value': maturity},
        {'label': 'SETUP', 'value': setup},
        {'label': 'CONTROL', 'value': control},
        {'label': 'PRICE', 'value': price},
        {'label': 'EVIDENCE', 'value': evidence},
    ]

all_dossiers = []

for t in tools:
    tid = t['id']
    if tid in CUSTOM_DOSSIERS:
        cust = CUSTOM_DOSSIERS[tid]
        all_dossiers.append({
            'id': tid,
            'name': t['name'],
            'url': t['url'],
            'verdict': cust['verdict'],
            'axes': cust['axes'],
            'bestFor': cust['bestFor'],
            'caveat': cust['caveat'],
        })
    elif tid in existing:
        all_dossiers.append(existing[tid])
    else:
        job = clean_str(t.get('job'))
        why = clean_str(t.get('why'))
        caveat = clean_str(t.get('caveat'))
        axes = build_axes(t)
        
        all_dossiers.append({
            'id': tid,
            'name': t['name'],
            'url': t['url'],
            'verdict': why,
            'axes': axes,
            'bestFor': [
                job,
                f"Teams requiring verified workflows in {t.get('category')}",
                f"Replacing ad-hoc generic tools with dedicated {t.get('name')} instrumentation",
            ],
            'caveat': caveat,
        })

with open(DOSSIERS_PATH, 'w', encoding='utf-8') as f:
    json.dump(all_dossiers, f, indent=2, ensure_ascii=False)

print(f"Successfully generated {len(all_dossiers)} dossiers in {DOSSIERS_PATH}")
