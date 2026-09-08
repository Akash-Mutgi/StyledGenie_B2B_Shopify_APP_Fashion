from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "StyledGenie_Implementation_Roadmap.pdf"

NAVY = colors.HexColor("#17233C")
PURPLE = colors.HexColor("#6E56CF")
LILAC = colors.HexColor("#EEEAFE")
INK = colors.HexColor("#202636")
MUTED = colors.HexColor("#657084")
PALE = colors.HexColor("#F5F7FB")
GREEN = colors.HexColor("#217A58")
AMBER = colors.HexColor("#B66B11")
RED = colors.HexColor("#B53B47")
LINE = colors.HexColor("#D9DEEA")
WHITE = colors.white


def register_fonts():
    candidates = [
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ("C:/Windows/Fonts/calibri.ttf", "C:/Windows/Fonts/calibrib.ttf"),
    ]
    for regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont("SGRegular", regular))
            pdfmetrics.registerFont(TTFont("SGBold", bold))
            return "SGRegular", "SGBold"
    return "Helvetica", "Helvetica-Bold"


REGULAR, BOLD = register_fonts()


class RoadmapDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
            id="main",
        )
        self.addPageTemplates(PageTemplate(id="roadmap", frames=[frame], onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        canvas.saveState()
        width, height = A4
        if doc.page == 1:
            canvas.setFillColor(NAVY)
            canvas.rect(0, 0, width, height, fill=1, stroke=0)
            canvas.setFillColor(PURPLE)
            canvas.circle(width - 12 * mm, height - 18 * mm, 45 * mm, fill=1, stroke=0)
            canvas.setFillColor(colors.HexColor("#8A72E8"))
            canvas.circle(width - 26 * mm, 20 * mm, 28 * mm, fill=1, stroke=0)
        else:
            canvas.setStrokeColor(LINE)
            canvas.line(18 * mm, height - 14 * mm, width - 18 * mm, height - 14 * mm)
            canvas.setFont(BOLD, 8)
            canvas.setFillColor(NAVY)
            canvas.drawString(18 * mm, height - 10 * mm, "STYLEDGENIE IMPLEMENTATION ROADMAP")
            canvas.setFont(REGULAR, 8)
            canvas.setFillColor(MUTED)
            canvas.drawRightString(width - 18 * mm, height - 10 * mm, "Code audit - 10 Aug 2026")
            canvas.line(18 * mm, 13 * mm, width - 18 * mm, 13 * mm)
            canvas.drawString(18 * mm, 8.5 * mm, "Confidential working plan")
            canvas.drawRightString(width - 18 * mm, 8.5 * mm, f"Page {doc.page}")
        canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName=BOLD, fontSize=11, leading=14, textColor=colors.HexColor("#D8D1FF"), spaceAfter=8))
styles.add(ParagraphStyle(name="CoverTitle", fontName=BOLD, fontSize=29, leading=34, textColor=WHITE, spaceAfter=14))
styles.add(ParagraphStyle(name="CoverSub", fontName=REGULAR, fontSize=12, leading=18, textColor=colors.HexColor("#E7EAF1"), spaceAfter=8))
styles.add(ParagraphStyle(name="CoverMeta", fontName=REGULAR, fontSize=9.5, leading=15, textColor=colors.HexColor("#C8CFDE")))
styles.add(ParagraphStyle(name="H1x", fontName=BOLD, fontSize=20, leading=25, textColor=NAVY, spaceBefore=2, spaceAfter=12))
styles.add(ParagraphStyle(name="H2x", fontName=BOLD, fontSize=13.5, leading=18, textColor=NAVY, spaceBefore=12, spaceAfter=7))
styles.add(ParagraphStyle(name="H3x", fontName=BOLD, fontSize=10.5, leading=14, textColor=PURPLE, spaceBefore=8, spaceAfter=4))
styles.add(ParagraphStyle(name="Bodyx", fontName=REGULAR, fontSize=9.2, leading=13.4, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", fontName=REGULAR, fontSize=8, leading=11.2, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name="Bulletx", fontName=REGULAR, fontSize=8.8, leading=12.4, textColor=INK, leftIndent=11, firstLineIndent=-7, bulletIndent=2, spaceAfter=3))
styles.add(ParagraphStyle(name="Calloutx", fontName=BOLD, fontSize=10.3, leading=15, textColor=NAVY, leftIndent=8, rightIndent=8, spaceBefore=7, spaceAfter=7))
styles.add(ParagraphStyle(name="TableHead", fontName=BOLD, fontSize=7.5, leading=9.2, textColor=WHITE))
styles.add(ParagraphStyle(name="TableBody", fontName=REGULAR, fontSize=7.5, leading=10, textColor=INK))
styles.add(ParagraphStyle(name="TableBold", fontName=BOLD, fontSize=7.5, leading=10, textColor=INK))
styles.add(ParagraphStyle(name="Tiny", fontName=REGULAR, fontSize=6.8, leading=8.6, textColor=MUTED))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"- {text}", styles["Bulletx"])


def section_title(number, title, subtitle=None):
    out = [P(f"{number}. {title}", "H1x")]
    if subtitle:
        out.append(P(subtitle, "Bodyx"))
    return out


def callout(text, color=LILAC):
    t = Table([[P(text, "Calloutx")]], colWidths=[171 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("BOX", (0, 0), (-1, -1), 0.7, PURPLE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def styled_table(rows, widths, header=True, small=False):
    data = []
    for r, row in enumerate(rows):
        data.append([
            cell if hasattr(cell, "wrap") else P(str(cell), "TableHead" if header and r == 0 else ("Tiny" if small else "TableBody"))
            for cell in row
        ])
    table = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), NAVY)]
        if len(rows) > 1:
            commands += [("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE])]
    table.setStyle(TableStyle(commands))
    return table


workstreams = [
    {
        "id": "W1", "name": "Release stabilization", "priority": "P0", "count": 7, "effort": "2-3 days",
        "objective": "Make the current codebase deployable and ensure the local demo matches the Shopify storefront.",
        "items": [
            "Review and preserve the current uncommitted changes before additional feature work.",
            "Select apps/storefront-widget as the canonical widget source.",
            "Create a repeatable asset build/sync process for backend static files and the Shopify theme extension.",
            "Restore shopify.app.toml as valid Shopify configuration.",
            "Remove or quarantine captured development artifacts and duplicated obsolete assets.",
            "Add safe startup configuration validation and a release smoke-check command.",
            "Update README, tickets, and run/deploy instructions to match the real architecture.",
        ],
        "accept": [
            "Local and Shopify widgets have matching behavior and visual assets.",
            "The Shopify CLI parses the app configuration and can package the extension.",
            "A clean checkout can start the backend and render both UI surfaces.",
        ],
    },
    {
        "id": "W2", "name": "Core product intelligence and UX", "priority": "P0", "count": 12, "effort": "4-6 days",
        "objective": "Prove every mandatory StyledGenie behavior with deterministic automated checks.",
        "items": [
            "Test strict styling/support mode separation in backend responses and frontend rendering.",
            "Test image-first ordering so Vision runs before generic questions.",
            "Test Find My Outfit extraction for event, budget, vibe, weather, and urgency.",
            "Test the mandatory options-versus-best-one decision prompt.",
            "Guarantee decision mode returns one outfit only.",
            "Test Complete My Look anchor identification and missing-category gap analysis.",
            "Test palette, silhouette, occasion, and weather compatibility rules.",
            "Test Get Inspired hero-first ordering with one closest match.",
            "Test Smart Swap changes only the requested category.",
            "Test menswear/womenswear guardrails and ambiguous-segment clarification.",
            "Require concise Why this works explanations on every recommendation.",
            "Add accessibility, mobile, camera, voice, upload, and failure-state QA.",
        ],
        "accept": [
            "All mandatory AGENTS.md rules have positive and negative automated tests.",
            "Support responses cannot render styling cards, chips, or outfit actions.",
            "External AI failure produces short actionable fallbacks without breaking the flow.",
        ],
    },
    {
        "id": "W3", "name": "Shopify security and multi-tenancy", "priority": "P0", "count": 11, "effort": "7-10 days",
        "objective": "Turn the current single-store backend into a secure Shopify application boundary.",
        "items": [
            "Implement Shopify OAuth/install lifecycle and embedded-app session-token verification.",
            "Resolve merchant context from the authenticated shop, not DEFAULT_MERCHANT_ID.",
            "Protect all merchant read and write endpoints.",
            "Separate public storefront endpoints from merchant administration endpoints.",
            "Validate signed shop context and customer identifiers from storefront traffic.",
            "Replace wildcard CORS with explicit configured origins.",
            "Store and rotate Shopify credentials per merchant.",
            "Add uninstall, customer-data request, and customer-data erasure handlers.",
            "Enable tenant isolation using Supabase RLS and server-side enforcement.",
            "Add rate limits, request IDs, and audit logs for sensitive writes.",
            "Add merchant and staff role authorization where dashboard collaboration is needed.",
        ],
        "accept": [
            "Unauthenticated merchant calls return 401 or 403.",
            "One shop cannot read or mutate another shop's products, settings, orders, or analytics.",
            "Install, reinstall, credential refresh, and uninstall paths are tested.",
        ],
    },
    {
        "id": "W4", "name": "Operational customer support", "priority": "P1", "count": 9, "effort": "4-6 days",
        "objective": "Convert implemented support logic into a real, merchant-configured service.",
        "items": [
            "Sync and validate real development-store orders, fulfillment, returns, and line items.",
            "Require both order number and email before disclosing order information.",
            "Implement explicit live-versus-snapshot status labels.",
            "Configure merchant returns, exchanges, shipping, sizing, and escalation policies.",
            "Complete refund-versus-exchange selection and affected-item identification.",
            "Validate return windows, item eligibility, availability, and replacement sizes.",
            "Configure email handoff first and optional WhatsApp/Twilio second.",
            "Persist notification attempts, retries, ownership, status, and resolution notes.",
            "Keep damaged/wrong-item image handling isolated in support mode.",
        ],
        "accept": [
            "A valid order returns real status; an invalid lookup leaks no customer data.",
            "Returns and exchanges identify the exact order and item before action.",
            "A handoff is stored, delivered, visible to the merchant, and auditable.",
        ],
    },
    {
        "id": "W5", "name": "Catalog intelligence and merchant controls", "priority": "P1", "count": 8, "effort": "4-6 days",
        "objective": "Make recommendations consistently usable across the full live catalog.",
        "items": [
            "Add webhook-driven or scheduled product, inventory, variant, and price synchronization.",
            "Auto-tag untagged catalog products in controlled, resumable batches.",
            "Add merchant review and approval before Shopify tag/metafield write-back.",
            "Create and save initial curated looks using real catalog products.",
            "Validate generated product descriptions before Shopify application.",
            "Enforce inventory, market, currency, size, and variant availability.",
            "Make merchant AI behavior and knowledge settings affect shopper responses.",
            "Add data-quality alerts for stale data, missing links, images, variants, and weak categories.",
        ],
        "accept": [
            "Every recommendable product has segment, category, palette/style tags, image, link, and variant data.",
            "Catalog freshness remains inside an agreed service interval.",
            "Merchant configuration changes storefront behavior without a code deployment.",
        ],
    },
    {
        "id": "W6", "name": "Commerce attribution and analytics", "priority": "P1", "count": 7, "effort": "3-5 days",
        "objective": "Connect recommendations to checkout outcomes and trustworthy merchant reporting.",
        "items": [
            "Preserve StyledGenie attribution through product view, cart, checkout, and order.",
            "Ingest orders and fulfillment updates via webhook with scheduled reconciliation.",
            "Match assisted line items to recommendation sessions and modes.",
            "Calculate assisted orders, conversion rate, revenue, average order value, and drop-off.",
            "Correct intent and journey event classification inconsistencies.",
            "Add date, mode, category, campaign, and product filters.",
            "Add analytics reconciliation tests against Shopify source totals.",
        ],
        "accept": [
            "A test purchase from a recommendation appears as AI-assisted.",
            "Revenue metrics derive from stored Shopify orders rather than placeholder values.",
            "Journey totals and classifications can be reconciled and explained.",
        ],
    },
    {
        "id": "W7", "name": "Platform engineering and AI operations", "priority": "P1", "count": 10, "effort": "6-9 days",
        "objective": "Make the service maintainable, observable, resilient, and cost-controlled.",
        "items": [
            "Split oversized conversation and recommendation services into focused modules.",
            "Move long catalog, Vision, tagging, notification, and analytics work to background jobs.",
            "Add retry, timeout, circuit-breaker, idempotency, and dead-letter behavior.",
            "Define versioned API contracts and consistent error envelopes.",
            "Add structured logs, tracing, latency metrics, health checks, and alerts.",
            "Track AI token cost, Vision cost, model latency, fallback rate, and failure rate.",
            "Create a fixed AI evaluation dataset covering all modes and edge cases.",
            "Add prompt-injection defenses for shopper input, URLs, images, and merchant knowledge.",
            "Add input size limits, image type checks, URL safety controls, and abuse prevention.",
            "Add caching and query/index optimization after measuring actual bottlenecks.",
        ],
        "accept": [
            "Slow external systems cannot exhaust web workers or duplicate writes.",
            "Operators can identify which dependency failed and which shopper journey was affected.",
            "AI quality and cost regressions are detected before release.",
        ],
    },
    {
        "id": "W8", "name": "Privacy, commercial readiness, and launch", "priority": "P2", "count": 8, "effort": "5-8 days",
        "objective": "Complete the business, privacy, operational, and release requirements for a public SaaS launch.",
        "items": [
            "Define shopper consent, preference export/deletion, and conversation/image retention.",
            "Add privacy policy, terms, merchant support, and incident-response documentation.",
            "Implement Shopify subscription plans, trial rules, billing state, and usage limits.",
            "Add staging and production environments with managed secrets and migrations.",
            "Add CI/CD, deployment approvals, smoke tests, rollback, backup, and restore drills.",
            "Complete browser, device, theme, localization, currency, and accessibility validation.",
            "Prepare merchant onboarding, empty states, setup progress, and self-service diagnostics.",
            "Run production pilot, resolve launch blockers, and prepare the public release checklist.",
        ],
        "accept": [
            "Data collection, retention, export, and deletion are documented and testable.",
            "Billing state correctly enables, limits, or disables paid functionality.",
            "A clean production deployment can be rolled back and restored safely.",
        ],
    },
]


def add_cover(story):
    story += [Spacer(1, 48 * mm), P("PRODUCT AND ENGINEERING AUDIT", "CoverKicker")]
    story += [P("StyledGenie<br/>Complete Implementation Roadmap", "CoverTitle")]
    story += [P("Combined plan for demo readiness, secure single-store production, and a public multi-merchant Shopify SaaS launch.", "CoverSub")]
    story += [Spacer(1, 12 * mm)]
    meta = Table([
        [P("Audit date", "TableHead"), P("10 August 2026", "TableBody")],
        [P("Scope", "TableHead"), P("72 implementation items across 8 workstreams", "TableBody")],
        [P("Codebase", "TableHead"), P("Storefront widget, merchant dashboard, FastAPI backend, Shopify extension, Supabase", "TableBody")],
        [P("Planning range", "TableHead"), P("8-12 weeks for one developer to reach public SaaS readiness", "TableBody")],
    ], colWidths=[36 * mm, 105 * mm])
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#6750C8")),
        ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#F4F1FF")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9B8CE0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [meta, Spacer(1, 14 * mm), P("Prepared from a read-only audit of the running application, source code, configuration, data readiness, and existing project documentation.", "CoverMeta"), PageBreak()]


def add_executive_summary(story):
    story += section_title("1", "Executive summary", "StyledGenie already has meaningful styling and support logic. The correct next move is to stabilize and secure it, not rebuild it.")
    story += [callout("Bottom line: 72 scoped implementation items. Demo-ready requires about 7-12 developer-days. Secure single-store production requires about 24-36 developer-days. Public multi-merchant SaaS readiness requires about 40-61 developer-days including contingency, or roughly 8-12 weeks for one developer.")]
    story += [P("What is already working", "H2x")]
    for item in [
        "FastAPI backend serves a live storefront demo and merchant dashboard.",
        "OpenAI, LangChain orchestration, and Google Vision report ready in the running workspace.",
        "Find My Outfit includes profile extraction, decision mode, recommendations, explanations, and refinement.",
        "Complete My Look contains anchor analysis, gap analysis, palette logic, and complementary selection.",
        "Get Inspired contains hero-first ranking and supporting-item selection.",
        "Smart Swap replaces one requested category while retaining outfit context.",
        "Support contains routing, tracking, return/exchange, sizing, issue-image, and handoff logic.",
        "Merchant APIs cover catalog, workspace, customization, knowledge, care setup, description generation, looks, and analytics.",
    ]:
        story.append(bullet(item))
    story += [P("What prevents production release", "H2x")]
    for item in [
        "The local storefront and Shopify-delivered widget are materially different versions.",
        "The main shopify.app.toml file is not valid TOML; it contains a Python patch script.",
        "Merchant administration endpoints do not enforce Shopify authentication.",
        "Data access is centered on one DEFAULT_MERCHANT_ID rather than authenticated shop tenancy.",
        "There is no automated test suite for the mandatory product rules.",
        "Support logic is not connected to real operational content: zero synced orders, zero configured FAQs, and no notification provider.",
        "Commerce attribution is present conceptually but no assisted orders or revenue are recorded.",
    ]:
        story.append(bullet(item))
    story += [PageBreak()]


def add_audit_snapshot(story):
    story += section_title("2", "Evidence-backed audit snapshot")
    rows = [
        ["Area", "Observed state", "Assessment"],
        ["Runtime", "Backend health and all inspected GET surfaces returned HTTP 200.", "Working"],
        ["Catalog", "840 products; all reported with images and links.", "Strong base"],
        ["Catalog intelligence", "152 tagged products; 796 tags; average 5.95 tags on tagged/available data.", "Incomplete coverage"],
        ["Catalog freshness", "Last recorded sync was about 167.7 hours old at audit time.", "Needs automation"],
        ["AI stack", "OpenAI, LangChain tools, and Google Vision REST reported ready.", "Working, untested"],
        ["Chat usage", "545 interactions across 36 sessions; 66 outfit and 26 image recommendation events.", "Active data"],
        ["Complete My Look", "No completed journey events recorded in analytics.", "Needs E2E proof"],
        ["Support content", "0 merchant FAQs, 1 knowledge entry, 0% support coverage; endpoint uses fallback FAQs.", "Not operational"],
        ["Orders", "Orders scope ready, but 0 synced orders and 0 assisted orders.", "Not validated"],
        ["Curated looks", "0 saved looks.", "Missing merchant content"],
        ["Testing", "Syntax checks pass; only a manual QA checklist is present.", "High regression risk"],
    ]
    story += [styled_table(rows, [33 * mm, 98 * mm, 40 * mm])]
    story += [Spacer(1, 7 * mm), P("Repository-specific structural findings", "H2x")]
    findings = [
        ("P0", "Widget drift", "apps/storefront-widget/app.js is much newer and larger than backend/static and the Shopify extension asset. The demo and deployed extension are not one release artifact."),
        ("P0", "Invalid deploy config", "shopify.app.toml starts with Python code instead of Shopify TOML configuration."),
        ("P0", "Missing admin boundary", "Merchant routes perform reads and writes without a Depends/authentication guard."),
        ("P0", "Single-store resolution", "SupabaseService repeatedly resolves DEFAULT_MERCHANT_ID rather than authenticated shop context."),
        ("P0", "Open CORS", "The backend enables wildcard origins with credentials."),
        ("P1", "Large modules", "The conversation and recommendation services are each several thousand lines, increasing regression and review cost."),
        ("P1", "Synchronous external work", "Catalog, Vision, OpenAI, Shopify, and notification calls can occupy request workers and need controlled retries/jobs."),
        ("P1", "Data isolation", "The checked schema has merchant_id columns but no visible row-level security policies."),
    ]
    rows2 = [["Priority", "Finding", "Impact"]] + [[p, f, i] for p, f, i in findings]
    story += [styled_table(rows2, [19 * mm, 39 * mm, 113 * mm], small=True), PageBreak()]


def add_scope_totals(story):
    story += section_title("3", "Total scope, effort, and release choices", "Effort ranges are planning estimates, not delivery guarantees. They assume one developer familiar with the codebase and timely access to Shopify, Supabase, and production credentials.")
    rows = [["Workstream", "Priority", "Items", "Estimated effort"]]
    for ws in workstreams:
        rows.append([f"{ws['id']} - {ws['name']}", ws["priority"], str(ws["count"]), ws["effort"]])
    rows.append([P("TOTAL", "TableBold"), "", P("72", "TableBold"), P("35-53 developer-days before contingency", "TableBold")])
    story += [styled_table(rows, [92 * mm, 23 * mm, 20 * mm, 36 * mm])]
    story += [P("Three valid finish lines", "H2x")]
    release_rows = [
        ["Target", "Included scope", "Estimate", "Use case"],
        ["Demo-ready", "W1 + core W2 checks + basic support data", "7-12 days", "Merchant demonstration and controlled development store"],
        ["Secure single-store production", "W1-W7, scoped to one merchant and no public billing", "24-36 days", "One known merchant on stable hosting"],
        ["Public Shopify SaaS", "All workstreams, contingency, public lifecycle and billing", "40-61 days / 8-12 weeks", "Multiple merchants and public distribution"],
    ]
    story += [styled_table(release_rows, [42 * mm, 68 * mm, 28 * mm, 33 * mm])]
    story += [Spacer(1, 7 * mm), callout("Recommended commitment: stabilize the current release first, then target secure single-store production. Treat public SaaS work as a separate approved release because it introduces billing, multi-tenancy, privacy, and operational obligations.", colors.HexColor("#EAF6F0"))]
    story += [P("Priority meaning", "H2x")]
    for text in [
        "P0 - release blocker: deploy integrity, mandatory product behavior, authentication, and tenant isolation.",
        "P1 - operational requirement: real support, catalog coverage, analytics, resilience, and observability.",
        "P2 - public SaaS requirement: billing, privacy operations, self-service onboarding, and launch governance.",
    ]:
        story.append(bullet(text))
    story += [PageBreak()]


def add_workstream(story, idx, ws):
    story += section_title(str(idx), f"{ws['id']} - {ws['name']}")
    meta = styled_table([
        ["Priority", "Items", "Effort", "Objective"],
        [ws["priority"], str(ws["count"]), ws["effort"], ws["objective"]],
    ], [22 * mm, 18 * mm, 28 * mm, 103 * mm])
    story += [meta, Spacer(1, 5 * mm), P("Implementation details", "H2x")]
    for n, item in enumerate(ws["items"], 1):
        story.append(bullet(f"{ws['id']}.{n} {item}"))
    story += [P("Acceptance criteria", "H2x")]
    for item in ws["accept"]:
        story.append(bullet(item))
    story += [PageBreak()]


def add_sequence(story):
    story += section_title("12", "Recommended execution sequence and dependencies")
    rows = [
        ["Sequence", "Work", "Depends on", "Release gate"],
        ["1", "W1 Release stabilization", "Current working tree", "One canonical widget and valid deploy config"],
        ["2", "W2 Core product tests", "Stable release artifact", "Mandatory behavior regression suite passes"],
        ["3", "W3 Shopify security", "Stable API contracts", "Authenticated tenant isolation passes"],
        ["4", "W4 Support operations", "Shop context and order access", "Real tracking, return, and handoff verified"],
        ["5", "W5 Catalog controls", "Tenant context and job processing", "Fresh, tagged, inventory-safe catalog"],
        ["6", "W6 Analytics", "Order sync and attribution metadata", "Test purchase reconciles to Shopify"],
        ["7", "W7 Platform operations", "Can begin earlier; completes before production", "Alerts, retries, evals, and CI active"],
        ["8", "W8 Public launch", "All production gates", "Billing, privacy, staging, rollback, and pilot complete"],
    ]
    story += [styled_table(rows, [20 * mm, 51 * mm, 56 * mm, 44 * mm], small=True)]
    story += [P("Suggested 12-week one-developer roadmap", "H2x")]
    timeline = [
        ["Weeks", "Primary outcome"],
        ["1", "Stabilize sources, assets, config, docs, and smoke checks."],
        ["2", "Automate mandatory styling/support behavior and resolve discovered regressions."],
        ["3-4", "Implement Shopify authentication, tenant resolution, protected merchant APIs, and RLS."],
        ["5", "Connect real support policies, order lookup, returns/exchanges, and email handoff."],
        ["6", "Automate catalog sync/tagging and validate merchant configuration behavior."],
        ["7", "Complete attribution, order ingestion, and reconciled analytics."],
        ["8-9", "Background jobs, error handling, observability, AI evaluation, and security hardening."],
        ["10", "Billing, privacy operations, onboarding, accessibility, and localization."],
        ["11", "Staging pilot, performance testing, backup/restore, and release rehearsal."],
        ["12", "Fix pilot findings, production cutover, monitoring, and controlled launch."],
    ]
    story += [styled_table(timeline, [25 * mm, 146 * mm])]
    story += [Spacer(1, 6 * mm), P("<b>Parallelization note:</b> Small parts can overlap, but W3 must precede any public merchant access, and W4/W6 depend on reliable Shopify shop and order context.", "Smallx"), PageBreak()]


def add_testing_matrix(story):
    story += section_title("13", "Required test and quality matrix")
    rows = [
        ["Layer", "Required coverage", "Minimum release gate"],
        ["Unit", "Routing, profile extraction, gap analysis, ranking, segment filtering, swaps, support intent, policy resolution", "Critical rule branches covered with fixed fixtures"],
        ["API integration", "Chat, image, refine, feedback, catalog, merchant writes, support, analytics, authentication", "Success, validation, authorization, and dependency-failure cases pass"],
        ["Contract", "Frontend payloads versus Pydantic schemas and stable error envelope", "No silent field drift between widget and backend"],
        ["AI evaluation", "Representative fashion, ambiguity, image, support, injection, and failure prompts", "Quality thresholds recorded and compared per release"],
        ["Shopify E2E", "Install, embedded dashboard, widget, PDP, cart, checkout, order, return, uninstall", "Test store journey completes without manual database edits"],
        ["Security", "Auth bypass, tenant crossover, PII disclosure, rate limit, malicious URL/image, prompt injection", "No high-severity open findings"],
        ["Accessibility", "Keyboard, focus, labels, screen reader, contrast, reduced motion, zoom", "Core journeys meet agreed accessibility baseline"],
        ["Compatibility", "Mobile/desktop, major browsers, representative Shopify themes", "No blocking layout or interaction defects"],
        ["Performance", "Widget load, API latency, image payload, catalog sync, concurrent chat", "Budgets defined and measured in staging"],
        ["Resilience", "OpenAI, Vision, Supabase, Shopify, SMTP/Twilio timeouts and partial outage", "Actionable fallbacks; no duplicate writes or worker exhaustion"],
    ]
    story += [styled_table(rows, [28 * mm, 88 * mm, 55 * mm], small=True)]
    story += [P("Mandatory shopper acceptance scenarios", "H2x")]
    for item in [
        "Find My Outfit infers known details, asks only missing critical inputs, asks the decision-mode question, and returns the requested number of outfits.",
        "Complete My Look analyzes an uploaded garment first, identifies what is present and missing, then returns only compatible missing categories.",
        "Get Inspired presents one closest hero match followed by compact supporting items.",
        "Smart Swap changes one item category and preserves the rest of the look.",
        "Track My Order asks for order number and email, then returns real status without showing policy-first content.",
        "Returns and exchanges identify the order/item and present actionable refund or exchange choices.",
        "Every support journey removes styling UI; every recommendation contains a useful Why this works explanation.",
    ]:
        story.append(bullet(item))
    story += [PageBreak()]


def add_risks(story):
    story += section_title("14", "Risk register and controls")
    rows = [
        ["Risk", "Likelihood", "Impact", "Control"],
        ["Local demo differs from Shopify release", "High", "High", "Canonical source plus automated asset parity check"],
        ["Unauthenticated merchant mutation", "High", "Critical", "Shopify session verification and route authorization"],
        ["Cross-merchant data exposure", "High for SaaS", "Critical", "Authenticated tenant context, RLS, isolation tests"],
        ["AI returns plausible but invalid products", "Medium", "High", "Deterministic validation after generation and inventory checks"],
        ["Support discloses order data", "Medium", "Critical", "Order plus email match, rate limits, audit logs, negative tests"],
        ["External API latency blocks requests", "High", "High", "Timeouts, background jobs, retries, circuit breakers"],
        ["Catalog becomes stale", "High", "Medium", "Webhooks, scheduled reconciliation, freshness alert"],
        ["AI cost increases unexpectedly", "Medium", "Medium", "Usage budgets, caching, model routing, cost dashboards"],
        ["Large monolith causes regressions", "High", "High", "Characterization tests before incremental extraction"],
        ["Production release cannot roll back", "Medium", "High", "Versioned deploys, migration discipline, rollback rehearsal"],
    ]
    story += [styled_table(rows, [51 * mm, 23 * mm, 22 * mm, 75 * mm], small=True)]
    story += [Spacer(1, 7 * mm), callout("Do not start a broad frontend or backend rewrite. First lock behavior with tests, establish one release artifact, then extract modules incrementally where it improves reliability and decision clarity.", colors.HexColor("#FFF4E5"))]
    story += [P("Decisions required from the product owner", "H2x")]
    for item in [
        "Choose the next release target: demo-ready, secure single-store production, or public SaaS.",
        "Confirm whether email handoff is sufficient for the first release or WhatsApp is mandatory.",
        "Approve customer conversation, image, preference, and order-data retention periods.",
        "Define paid plans and usage limits only if public SaaS is selected.",
        "Provide the final returns, exchanges, shipping, privacy, and escalation policies.",
    ]:
        story.append(bullet(item))
    story += [PageBreak()]


def add_definition_done(story):
    story += section_title("15", "Final definition of done")
    story += [P("Demo-ready", "H2x")]
    for item in [
        "One canonical widget is visible in both local demo and development Shopify store.",
        "All four modes complete their happy path on desktop and mobile.",
        "At least one real order can be tracked and one handoff can be delivered.",
        "Mandatory mode separation, image-first, hero-first, decision-mode, gap-analysis, and Smart Swap checks pass.",
    ]:
        story.append(bullet(item))
    story += [P("Secure single-store production", "H2x")]
    for item in [
        "Stable HTTPS hosting, protected merchant APIs, explicit CORS, rate limiting, and audit logs are active.",
        "Catalog, inventory, orders, support content, attribution, and analytics run against the production store.",
        "Automated tests, monitoring, alerts, backups, and rollback are operational.",
        "Customer information is disclosed only after correct verification and retained according to policy.",
    ]:
        story.append(bullet(item))
    story += [P("Public multi-merchant Shopify SaaS", "H2x")]
    for item in [
        "OAuth/install/uninstall works independently for every merchant.",
        "Tenant isolation is enforced in application code and database policy.",
        "Billing, trials, usage enforcement, privacy webhooks, self-service onboarding, and merchant support are live.",
        "A production pilot passes, public-release documentation is complete, and the operational team can respond to incidents.",
    ]:
        story.append(bullet(item))
    story += [Spacer(1, 8 * mm), callout("Recommended next action: execute W1 Release stabilization, then immediately build W2 characterization tests. These two workstreams protect the value already present in the code and create a safe base for every subsequent feature.")]
    story += [P("Audit basis", "H2x")]
    story += [P("This roadmap was prepared from the repository's AGENTS.md rules, README, detailed functional flows, implementation tickets, production checklist, FastAPI routes and services, storefront and merchant JavaScript, Shopify extension assets/configuration, Supabase schema, runtime endpoint checks, configuration readiness checks, catalog/workspace metrics, and syntax verification. No application source files were modified during the audit; only this report and its temporary build artifacts were created.", "Smallx")]


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = RoadmapDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=19 * mm,
        leftMargin=19 * mm,
        topMargin=21 * mm,
        bottomMargin=18 * mm,
        title="StyledGenie Complete Implementation Roadmap",
        author="Codex",
        subject="Combined product, engineering, security, and launch plan",
    )
    story = []
    add_cover(story)
    add_executive_summary(story)
    add_audit_snapshot(story)
    add_scope_totals(story)
    for idx, ws in enumerate(workstreams, start=4):
        add_workstream(story, idx, ws)
    add_sequence(story)
    add_testing_matrix(story)
    add_risks(story)
    add_definition_done(story)
    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
