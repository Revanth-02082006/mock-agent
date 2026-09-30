# TNPSC Question Practice Agent

A clean, reliable, focused web application whose primary purpose is to generate and conduct **TNPSC Group 4-style question practice exclusively from one user-uploaded textbook PDF**.

---

## 🎯 Core Workflow

```
Upload textbook PDF ──> Read & Verify PDF ──> Generate TNPSC Question ──> User Answers ──> Evaluate & Explain ──> Next Question
```

---

## 🛡️ Key Principles & Design Rules

1. **Source-Locked Generation**:
   - The user's uploaded textbook PDF is the **sole factual source** for all questions, answer options, and explanations.
   - The application strictly prohibits internet lookups, external web data, or general AI training knowledge from introducing unverified facts.
2. **TNPSC Group 4 Syllabus Reference (Code: 496)**:
   - The official TNPSC Group 4 syllabus (SSLC Standard) is embedded as an **examination reference only** (to ensure question scope, standard, and realistic TNPSC question-setter framing), never as a factual source.
3. **Question-Setter Craftsmanship**:
   - Transforms textbook facts into authentic TNPSC questions:
     - Direct MCQs
     - Statement-based questions (*"Consider the following statements... Which is/are correct?"*)
     - Incorrect statement identification
     - Match the following / Correct pair
     - Chronological order
     - Identification based on clues
     - Application / Conceptual questions
   - Balanced difficulty: Mixture of Easy, Moderate, and Moderately Difficult via careful reading and elimination.
4. **Pre-Display Source Verification**:
   - Every generated question is verified against the original textbook page text and validated for single defensible correctness and freedom from OCR/Tamil Unicode corruption.
5. **Option E ("I Don't Know" / "விடை தெரியவில்லை")**:
   - Includes standard TNPSC Option E: `E) விடை தெரியவில்லை` (Tamil) / `E) I don't know` (English).
   - Selecting Option E marks the question as unanswered without penalty.
6. **Source Evidence in Every Explanation**:
   - When answers are evaluated, the application cites the exact **Page number** and provides the **verbatim textbook excerpt**.
7. **Single Active Book**:
   - Only one study PDF is active at any time (`Active Source: [filename]`). Uploading a new PDF replaces the previous source and resets the session cleanly.
8. **Minimal, Study-Focused Light Theme**:
   - Clean, light-themed user interface optimized for long study sessions.
   - Quick keyboard shortcuts: Keys `1`-`5` or `A`-`E` to select options, `Enter` to submit / advance.

---

## 🚀 How to Run Locally

### 1. Requirements
- Node.js (v18+)

### 2. Environment Setup
The API key is securely stored in `.env`:
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_PRIMARY_MODEL=gemini-3.8-flash
```

### 3. Start the Server
```bash
npm start
```
The server will start at: **http://localhost:3000**

---

## 📁 Project Structure

```
├── server.js                  # Express backend server (handles upload, sessions, routes)
├── pdfService.js              # PDF extraction, Tamil Unicode normalization, source verification
├── geminiService.js           # Gemini 3.8 Flash client with model fallback and pre-verification
├── syllabusReference.js       # Official TNPSC Group 4 syllabus structure & style guidance
├── public/
│   ├── index.html             # Clean, semantic light-themed HTML
│   ├── style.css              # Minimal, responsive study-oriented CSS
│   └── app.js                 # Interactive question runner and keyboard navigation
├── test_samples/
│   └── Standard_10_Social_Science_Sample.pdf # Ready-to-test sample textbook PDF
├── package.json
└── .env
```
