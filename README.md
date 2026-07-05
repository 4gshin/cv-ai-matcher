# AI Resume Evaluator 

A premium, full-stack AI-powered technical resume analyzer. This application parses PDF resumes and delivers structured, real-time profile evaluations using Google Gemini AI, featuring an executive value proposition, core tech stack categorization, key strengths, and strategic improvement paths.

---

## ⚡ Features

- **Resilient AI Pipeline:** Built with an exponential backoff retry mechanism to seamlessly handle temporary upstream API spikes (503 errors).
- **Strict Data Formatting:** Enforces deterministic JSON mode to dynamically map candidate profiles directly into structured UI components.
- **Premium UI/UX:** Features a sleek drag-and-drop zone, state-aware shimmer skeleton loaders, and fluid staggered fade-in animations.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, Tailwind CSS (via CDN)
- **Backend:** Node.js, Express
- **AI Engine:** Google Generative AI (gemini-2.5-flash)
- **Parsers & Utilities:** pdf2json, multer, cors, dotenv