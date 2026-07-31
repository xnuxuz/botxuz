# Graph Report - .  (2026-07-19)

## Corpus Check
- Corpus is ~2,342 words - fits in a single context window. You may not need a graph.

## Summary
- 30 nodes · 40 edges · 5 communities (4 shown, 1 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.82)
- Token cost: 38,640 input · 6,200 output

## Community Hubs (Navigation)
- AI Memory & Personalization
- Life OS Core & Notifications
- Clients, API & Data Storage
- AI Parsing & Quick Entry
- Monorepo Tooling

## God Nodes (most connected - your core abstractions)
1. `xnuxuz Personal Life OS` - 6 edges
2. `Express API` - 5 edges
3. `Data Model (Entity Summary)` - 5 edges
4. `Schedule & Assistant Module` - 4 edges
5. `Finance Module` - 4 edges
6. `AI Assistant Layer` - 4 edges
7. `Context Assembler` - 4 edges
8. `Quick Entry via Chat` - 4 edges
9. `Intent Router` - 3 edges
10. `NotificationService` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Offline-first Expense Entry` --semantically_similar_to--> `Quick Entry via Chat`  [INFERRED] [semantically similar]
  REQUIREMENT.MD → REQUIREMENT.MD  _Bridges community 3 → community 2_
- `xnuxuz Personal Life OS` --references--> `AI Assistant Layer`  [EXTRACTED]
  REQUIREMENT.MD → REQUIREMENT.MD  _Bridges community 1 → community 3_
- `xnuxuz Personal Life OS` --references--> `Grinding / Productivity Module`  [EXTRACTED]
  REQUIREMENT.MD → REQUIREMENT.MD  _Bridges community 1 → community 2_
- `AI Assistant Layer` --references--> `Context Assembler`  [EXTRACTED]
  REQUIREMENT.MD → REQUIREMENT.MD  _Bridges community 3 → community 0_
- `NotificationService` --references--> `BullMQ Background Jobs`  [EXTRACTED]
  REQUIREMENT.MD → REQUIREMENT.MD  _Bridges community 1 → community 0_

## Hyperedges (group relationships)
- **Three Life Domains of the Personal Life OS** — requirement_schedule_assistant_module, requirement_grinding_productivity_module, requirement_finance_module [EXTRACTED 1.00]
- **AI Personalization Memory Loop** — requirement_context_assembler, requirement_user_facts, requirement_correction_rules, requirement_ai_feedback_loop, requirement_memory_extraction_pipeline, requirement_rag_episodic_memory [EXTRACTED 1.00]
- **Single-VPS Docker Compose Stack** — requirement_express_api, requirement_mysql, requirement_redis_stack, requirement_bullmq, requirement_telegram_bot, requirement_web_dashboard [EXTRACTED 1.00]

## Communities (5 total, 1 thin omitted)

### Community 0 - "AI Memory & Personalization"
Cohesion: 0.29
Nodes (8): AI Feedback Loop, BullMQ Background Jobs, Context Assembler, Correction Rules, Memory Extraction Pipeline, RAG Episodic Memory, Redis Stack, user_facts Structured Memory

### Community 1 - "Life OS Core & Notifications"
Cohesion: 0.32
Nodes (8): Daily Briefing, Finance Module, Google Calendar Sync, NotificationService, xnuxuz Personal Life OS, Phased Build Roadmap, Schedule & Assistant Module, Telegram Bot Channel

### Community 2 - "Clients, API & Data Storage"
Cohesion: 0.33
Nodes (7): Data Model (Entity Summary), Express API, Grinding / Productivity Module, Mobile App (Expo), MySQL Main Database, Offline-first Expense Entry, Next.js Web Dashboard

### Community 3 - "AI Parsing & Quick Entry"
Cohesion: 0.50
Nodes (5): AI Assistant Layer, Intent Router, LLM Provider Abstraction, Quick Entry via Chat, Regex Fallback Parser

## Knowledge Gaps
- **5 isolated node(s):** `AI Feedback Loop`, `Google Calendar Sync`, `moon Monorepo`, `Biome Lint/Format`, `Next.js Web Dashboard`
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xnuxuz Personal Life OS` connect `Life OS Core & Notifications` to `Clients, API & Data Storage`, `AI Parsing & Quick Entry`?**
  _High betweenness centrality (0.278) - this node is a cross-community bridge._
- **Why does `AI Assistant Layer` connect `AI Parsing & Quick Entry` to `AI Memory & Personalization`, `Life OS Core & Notifications`?**
  _High betweenness centrality (0.250) - this node is a cross-community bridge._
- **Why does `Context Assembler` connect `AI Memory & Personalization` to `AI Parsing & Quick Entry`?**
  _High betweenness centrality (0.218) - this node is a cross-community bridge._
- **What connects `AI Feedback Loop`, `Google Calendar Sync`, `moon Monorepo` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._