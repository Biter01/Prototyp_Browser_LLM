# JKU Webshop · Chat mit lokalem LLM

Prototyp für das IT-Projekt 2026/27: Ein Webshop, der über einen Chat bedient wird.
Ein kleines Sprachmodell (Qwen über WebLLM) läuft **im Browser** und erkennt nur, was
der Nutzer will. Suche, Rückfragen und Warenkorb steuert der Code. Gesucht wird über
`GET /search` im Backend.

```
Prototyp_Browser_LLM/
├─ backend/    Fastify 5 + TypeScript, Basis: reisi007/jku-itpj2627-webshop-base
│              neu: src/search.ts (Ähnlichkeitssuche), src/routes/search.ts (GET /search)
└─ frontend/   Vite + TypeScript, Chat-Oberfläche, WebLLM, Ablauf im Code
```

## Starten

Voraussetzungen: Node.js ≥ 20, pnpm (`npm i -g pnpm` oder `corepack enable`),
Chrome oder Edge mit WebGPU.

```bash
pnpm install
pnpm dev
```

`pnpm dev` startet beide Teile:

- Backend auf http://localhost:3000 (Swagger-UI unter `/docs`)
- Frontend auf **http://localhost:5173**: diese Adresse im Browser öffnen

Vite leitet `/api/...` an das Backend weiter, deshalb braucht das Backend kein CORS.
Einzeln starten geht mit `pnpm dev:backend` bzw. `pnpm dev:frontend`.

## Prüfen

```bash
pnpm typecheck   # tsc in beiden Paketen
pnpm test        # vitest: Backend (Suche, Routen, Validate) + Frontend (Dialoge Ende-zu-Ende)
pnpm --filter webshop-backend openapi   # openapi.yaml mit /search neu erzeugen
```

Die Frontend-Tests brauchen weder Modell noch Server. Sie spielen echte Gesprächsverläufe
mit festen Modellantworten ab und rufen die Suchlogik des Backends direkt auf.

## Ablauf einer Nachricht

1. **Erkennung:** Klicks auf Antwort-Optionen, Nummern („Nr. 1 und Nr. 3“) und Varianten
   („S / White“) erkennt der Code selbst, ohne Modell. Alles andere geht an das Modell, das
   genau ein JSON-Objekt liefert (`intent`, `product`, `category`, `gender`, …).
2. **Prüfung im Code** (`frontend/src/verify.ts`): Werte, die weder im Text stehen noch im
   Gespräch geklärt sind, werden entfernt; Offensichtliches wird ergänzt.
3. **Ablauf im Code** (`frontend/src/flow.ts`): Suche über `GET /search`, Rückfragen aus den
   Facetten, Outfit Teil für Teil (`matchAll`), Warenkorb mit dem günstigsten lieferbaren Angebot
   je Variante (`offerId`, passend für `POST /validate`).

Der Gesprächszustand (geklärtes Geschlecht, offene Rückfrage, gezeigte Produkte, Warenkorb)
liegt in `frontend/src/context.ts`.

## Frontend-Module

| Datei | Inhalt |
| ----- | ------ |
| `src/main.ts` | Oberfläche: Chat, Warenkorb, Testlauf |
| `src/model.ts` | WebLLM hinter einer kleinen `Model`-Schnittstelle |
| `src/prompt.ts` | JSON-Schema, System-Prompt, Parsen der Modellausgabe |
| `src/verify.ts` | Prüfung der Erkennung gegen Text und Zustand |
| `src/flow.ts` | Ablauf im Code, Erkennung ohne Modell |
| `src/turn.ts` | ein Gesprächsschritt (gemeinsam für Chat und Tests) |
| `src/api.ts` | Backend-Client, Typen kommen aus `backend/src/types.ts` |
| `src/cases.ts` | Testfälle (Einzelsätze und Dialoge) für den Testlauf-Tab |
