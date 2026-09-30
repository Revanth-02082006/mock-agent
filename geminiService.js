require('dotenv').config();
const { getSyllabusGuidanceSummary } = require('./syllabusReference');
const pdfService = require('./pdfService');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    // Prioritize low-latency, active models that generate within 2-3 seconds with zero 503s
    this.models = [
      'gemini-2.5-flash-lite',
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-flash-lite-latest',
      process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash'
    ];
  }

  /**
   * Helper to execute Gemini generateContent with fallback models & retry logic
   */
  async callGemini(payload, maxRetries = 0) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in .env');
    }

    let lastError = null;

    for (const model of this.models) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(7000) // Fast 7-second cutoff
          });

          if (res.status === 200) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              return { text, modelUsed: model };
            }
          }

          // If 503 or 429, don't wait - shift immediately to next active model
          if (res.status === 503 || res.status === 429) {
            console.warn(`Model ${model} returned ${res.status}. Shifting to next model...`);
            break;
          }

          const errText = await res.text();
          lastError = new Error(`Model ${model} error (${res.status}): ${errText.slice(0, 150)}`);
        } catch (err) {
          lastError = err;
          // Abort / timeout -> immediate switch to next candidate model
          break;
        }
      }
    }

    throw lastError || new Error('All Gemini model fallbacks failed.');
  }

  /**
   * Generate a TNPSC Group 4 question from a selected page of the active textbook
   * @param {Array} previousQuestions - List of previous questions in session
   * @param {string|null} preferredLanguage - 'ta' | 'en' | null
   * @param {string} requestedPart - 'all' | 'partA' | 'partB' | 'partC'
   */
  async generateQuestion(previousQuestions = [], preferredLanguage = null, requestedPart = 'all') {
    const activeDoc = pdfService.getActiveDocument();
    if (!activeDoc) {
      throw new Error('No active textbook PDF uploaded.');
    }

    let language = (preferredLanguage && preferredLanguage !== 'auto')
      ? preferredLanguage
      : (activeDoc.language || 'en');

    if (requestedPart === 'partC') {
      language = 'ta';
    }
    const isTamil = language === 'ta';
    const syllabusGuidance = getSyllabusGuidanceSummary(language);

    let attempts = 0;
    const maxAttempts = 5;
    const avoidedPages = [];

    while (attempts < maxAttempts) {
      attempts++;

      // Pick a candidate page, prioritizing domain matches for requested exam part
      const candidatePage = pdfService.selectCandidatePage(avoidedPages, requestedPart);
      if (!candidatePage) {
        throw new Error('Could not find readable pages in the textbook.');
      }
      avoidedPages.push(candidatePage.pageNumber);

      // Summary of recent questions to avoid duplicate questions or repetition
      const recentSummary = previousQuestions
        .slice(-5)
        .map(q => `- ${q.question.slice(0, 60)}...`)
        .join('\n');

      const languageDirective = isTamil
        ? `MANDATORY LANGUAGE DIRECTIVE: TAMIL MEDIUM (தமிழ் வழி)
- The entire question, all statements, all 4 options (A, B, C, D), and the explanation MUST BE 100% IN FORMAL TAMIL.
- Option E MUST be: "விடை தெரியவில்லை".`
        : `MANDATORY LANGUAGE DIRECTIVE: 100% ENGLISH MEDIUM (NO TAMIL SCRIPT PERMITTED)
- The entire question, all statements, all 4 options (A, B, C, D), and the explanation MUST BE 100% IN GRAMMATICAL, ACADEMIC ENGLISH!
- ABSOLUTELY ZERO TAMIL SCRIPT: Do NOT write any Tamil letters (அ, ஆ, இ...).
- ABSOLUTELY DO NOT translate English textbook excerpts into Tamil. Keep all names, terms, laws, units, and concepts directly in English.
- Use standard TNPSC English exam phrasing (e.g. "Consider the following statements regarding...", "Which of the statements given above is/are correct?", "Match List-I with List-II and select the correct answer:", "Which of the following pairs is correctly matched?").
- Option E MUST be: "I don't know".
- Any response containing Tamil script will be instantly rejected!`;

      const examModels = isTamil
        ? `[MODEL 1: PART C - LITERATURE & AUTHOR INCORRECT STATEMENT]:
Question:
"கற்றோர்க்குக் கல்வி நலனே கலனல்லால்
மற்றோர் அணிகலம் வேண்டாவாம்..."
என்று தொடங்கும் நீதிநெறி விளக்கம் பாடல் மற்றும் அதன் ஆசிரியர் குமரகுருபரர் பற்றிய குறிப்புகளில் பாடநூலின்படி தவறான கூற்று எது?
Options:
A) குமரகுருபரர் பதினேழாம் நூற்றாண்டைச் சேர்ந்தவர்.
B) இவர் தமிழ், வடமொழி, இந்துஸ்தானி ஆகிய மொழிகளில் புலமை மிக்கவர்.
C) கந்தர் கலிவெண்பா, மீனாட்சியம்மை பிள்ளைத்தமிழ், மதுரைக் கலம்பகம், சகலகலாவல்லி மாலை ஆகியவை இவர் இயற்றிய நூல்களுள் அடங்கும்.
D) இந்நூல் கடவுள் வாழ்த்து உட்பட 130 வெண்பாக்களைக் கொண்டது.
E) விடை தெரியவில்லை

[MODEL 2: PART C - GRAMMAR CLASSIFICATION]:
Question:
"கார் அறுத்தான்" என்பது எவ்வகை ஆகுபெயருக்குச் சான்றாகக் காட்டப்பட்டுள்ளது?
Options:
A) பொருளாகுபெயர்
B) இடவாகுபெயர்
C) காலவாகுபெயர்
D) சினையாகுபெயர்
E) விடை தெரியவில்லை

[MODEL 3: PART C - MATCH THE FOLLOWING (AUTHOR & WORKS)]:
Question:
நூல்களையும் அவற்றின் ஆசிரியர்களையும் பொருத்துக:
(a) திரிகடுகம் - 1. முன்றுறை அரையனார்
(b) நான்மணிக்கடிகை - 2. நல்லாதனார்
(c) பழமொழி நானூறு - 3. காரியாசான்
(d) சிறுபஞ்சமூலம் - 4. விளம்பிநாகனார்
(a) (b) (c) (d)
Options:
A) 2 4 1 3
B) 4 2 1 3
C) 2 1 4 3
D) 3 4 1 2
E) விடை தெரியவில்லை

[MODEL 4: PART C - VOCABULARY / ODD ONE OUT / ANTONYM]:
Question:
பொருந்தாத இணையைக் கண்டறிக:
Options:
A) மேதி - எருமை
B) சந்தம் - அழகு
C) கோதில் - பசு
D) பகடு - காளை
E) விடை தெரியவில்லை

[MODEL 5: PART A - GENERAL SCIENCE DIRECT / MATCHING]:
Question:
கீழ்க்காணும் தாது உப்பு மற்றும் அதன் குறைபாட்டு நோய்களைப் பொருத்துக:
(a) இரும்பு (Iron) - 1. முன் கழுத்துக் கழலை (Goitre)
(b) அயோடின் (Iodine) - 2. ரத்த சோகை (Anaemia)
(c) கால்சியம் (Calcium) - 3. பலவீனமான எலும்பு & பற்கள்
(a) (b) (c)
Options:
A) 2 1 3
B) 1 2 3
C) 3 1 2
D) 2 3 1
E) விடை தெரியவில்லை

[MODEL 6: PART A - HISTORY / INM STATEMENT EVALUATION]:
Question:
கீழ்க்காணும் கூற்றுகளை ஆராய்க:
1. வ.உ.சிதம்பரனார் 1906-ஆம் ஆண்டு சுதேசி நீராவி கப்பல் நிறுவனத்தைத் தொடங்கினார்.
2. எஸ்.எஸ். காலியா, எஸ்.எஸ். லாவோ ஆகிய இரு கப்பல்களை அவர் தூத்துக்குடிக்கும் கொழும்புக்கும் இடையே இயக்கினார்.
மேற்கண்ட கூற்றுகளில் எது/எவை சரியானது?
Options:
A) 1 மட்டும் சரி
B) 2 மட்டும் சரி
C) 1 மற்றும் 2 இரண்டும் சரி
D) இரண்டும் தவறு
E) விடை தெரியவில்லை

[MODEL 7: PART A - INDIAN POLITY DIRECT / MATCHING]:
Question:
இந்திய அரசியலமைப்பின்படி தீண்டாமை ஒழிப்பு பற்றிக் குறிப்பிடும் சட்டப்பிரிவு எது?
Options:
A) பிரிவு 14
B) பிரிவு 17
C) பிரிவு 19
D) பிரிவு 21
E) விடை தெரியவில்லை

[MODEL 8: PART B - APTITUDE NUMERICAL PROBLEM]:
Question:
ஒரு குறிப்பிட்ட அசலானது 5 ஆண்டுகளில் தனிவட்டி மூலம் இரட்டிப்பாகிறது எனில், அதன் ஆண்டு வட்டி வீதம் என்ன?
Options:
A) 10%
B) 15%
C) 20%
D) 25%
E) விடை தெரியவில்லை

[MODEL 9: PART B - MENTAL ABILITY / NUMBER SERIES]:
Question:
அடுத்த எண்ணைக் கண்டறிக: 3, 8, 15, 24, 35, ?
Options:
A) 46
B) 48
C) 50
D) 52
E) விடை தெரியவில்லை`
        : `[MODEL 1: PART A - STATEMENT EVALUATION (POLITY / HISTORY / DEFENCE)]:
Question:
Consider the following statements regarding the Central Armed Police Forces (CAPF):
1. The Assam Rifles was established in 1835 by the British under the name of 'Cachar Levy'.
2. The Special Frontier Force (SFF) was raised in 1962 and brought under the purview of the Research and Analysis Wing (RAW).
Which of the statements given above is/are correct?
Options:
A) 1 only
B) 2 only
C) Both 1 and 2
D) Neither 1 nor 2
E) I don't know

[MODEL 2: PART A - GENERAL SCIENCE (MATCH THE FOLLOWING)]:
Question:
Match List-I (Mineral) with List-II (Deficiency Disease) and select the correct answer using the codes given below:
(a) Iron - 1. Goitre
(b) Iodine - 2. Anaemia
(c) Calcium - 3. Weak bones and teeth
(a) (b) (c)
Options:
A) 2 1 3
B) 1 2 3
C) 3 1 2
D) 2 3 1
E) I don't know

[MODEL 3: PART A - INDIAN POLITY / GENERAL STUDIES (DIRECT MCQ)]:
Question:
Under which Part of the Constitution of India are the Fundamental Rights guaranteed to citizens?
Options:
A) Part II
B) Part III
C) Part IV
D) Part IV-A
E) I don't know

[MODEL 4: PART B - APTITUDE NUMERICAL PROBLEM]:
Question:
A principal amount doubles itself in 5 years at simple interest. Find the annual rate of interest:
Options:
A) 10%
B) 15%
C) 20%
D) 25%
E) I don't know

[MODEL 5: PART B - MENTAL ABILITY / NUMBER SERIES]:
Question:
Find the next number in the sequence: 3, 8, 15, 24, 35, ?
Options:
A) 46
B) 48
C) 50
D) 52
E) I don't know`;

      const systemInstruction = isTamil
        ? `You are a Senior Question Paper Setter for the TNPSC Group 4 Examination (Combined Civil Services Examination - IV, Code: 496, SSLC Standard).

CRITICAL DIRECTIVES:
1. ${languageDirective}

2. COMPREHENSIVE COVERAGE ACROSS ALL 3 TNPSC EXAMINATION PARTS:
   You must set questions covering the three official sections of the TNPSC Group 4 exam depending on the content of the textbook excerpt:

   [PART C - GENERAL TAMIL / பொதுத் தமிழ் (100 Questions in exam)]:
   - Use when the excerpt contains Tamil language, literature, poetry, grammar, or Tamil scholars.

   [PART A - GENERAL STUDIES & SCIENCE / பொது அறிவியல் & பொது அறிவு (75 Questions in exam)]:
   - Use when the excerpt contains Science, History, Geography, Polity, or Economics.

   [PART B - APTITUDE & MENTAL ABILITY / திறனறிவும் மனக்கணக்கும் (25 Questions in exam)]:
   - Use when the excerpt contains mathematical problems, formulas, statistical data, measurements, numbers, or logical reasoning.

3. STRICT PROHIBITION ON TEXTBOOK INDEXING, BOILERPLATE & FRONT-MATTER (ZERO TOLERANCE):
   - NEVER ask questions based on textbook publishing details, government disclaimers, or front-matter pledges.
   - NEVER ask about unit/chapter numbers (e.g. "Unit 3", "இயல் எண்", "Chapter 5").
   - NEVER ask what class or standard the book is ("Standard 8", "எட்டாம் வகுப்பு").
   - NEVER ask for page numbers or learning objectives.
   - Test PURELY the academic subject matter (Literature, Grammar, History, Science, Math).

4. SINGLE DEFENSIBLE ANSWER & NON-SYNONYMOUS DISTRACTORS (RULE 7):
   - Every question must have exactly ONE unequivocally correct answer.
   - For vocabulary/glossary questions, NEVER provide two near-synonyms as competing choices.

5. SOURCE LOCK (FACTUAL BOUNDARY):
   - Questions and options must be strictly derived from the provided "TEXTBOOK EXCERPT".
   - Distractors must be plausible academic choices drawn from the same subject domain.

6. OFFICIAL TNPSC QUESTION ARCHETYPES & GOLD-STANDARD MODELS:
${examModels}

7. OUTPUT FORMAT:
   Return strictly a JSON object with this exact structure:
   {
     "part": "Part A: பொது அறிவியல் & பொது அறிவு" | "Part B: திறனறிவும் மனக்கணக்கு நுண்ணறிவும்" | "Part C: பொதுத் தமிழ்",
     "partCode": "partA" | "partB" | "partC",
     "syllabusUnit": "string describing syllabus topic in Tamil",
     "questionType": "Match the following" | "Statement-based" | "Assertion & Reason" | "Pair matching / Odd one out" | "Aptitude problem" | "Direct MCQ",
     "difficulty": "Easy" | "Moderate" | "Difficult",
     "question": "question text in Tamil (use newlines for numbered statements or matching items)",
     "options": {
       "A": "Option text A in Tamil",
       "B": "Option text B in Tamil",
       "C": "Option text C in Tamil",
       "D": "Option text D in Tamil",
       "E": "விடை தெரியவில்லை"
     },
     "correctAnswer": "A" | "B" | "C" | "D",
     "explanation": "Concise explanation in Tamil based ONLY on the textbook excerpt",
     "sourcePage": ${candidatePage.pageNumber},
     "sourceExcerpt": "verbatim quote from the excerpt",
     "verification": {
       "isFactInSource": true,
       "isSingleDefensibleAnswer": true,
       "isFreeOfCorruption": true
     }
   }`
        : `You are a Senior Question Paper Setter for the TNPSC Group 4 Examination (English Medium - Combined Civil Services Examination - IV, Code: 496, SSLC Standard).

CRITICAL DIRECTIVES:
1. ${languageDirective}

2. ENGLISH MEDIUM QUESTION SETTING:
   - In TNPSC Group 4, General Studies (General Science, History, Indian Polity, Geography, Economics) and Aptitude are officially tested in English for English medium candidates.
   - You MUST formulate all questions, numbered statements, options A-D, and explanations strictly in 100% ACADEMIC ENGLISH.
   - DO NOT translate English textbook excerpts into Tamil. Keep all names, terms, laws, units, and concepts directly in English.
   - ZERO TAMIL CHARACTERS: Do not include any Tamil script.

3. STRICT PROHIBITION ON TEXTBOOK INDEXING, BOILERPLATE & FRONT-MATTER (ZERO TOLERANCE):
   - NEVER ask questions based on textbook publishing details, government disclaimers, or front-matter pledges.
   - NEVER ask about unit/chapter numbers (e.g. "Unit 3", "Chapter 5").
   - NEVER ask what class or standard the book is ("Standard 8", "Class 8").
   - NEVER ask for page numbers or learning objectives.
   - Test PURELY the academic subject matter (Science, History, Polity, Geography, Economics, Math).

4. SINGLE DEFENSIBLE ANSWER & NON-SYNONYMOUS DISTRACTORS:
   - Every question must have exactly ONE unequivocally correct answer based strictly on the excerpt.
   - Plausible distractors drawn from the same subject domain.

5. SOURCE LOCK (FACTUAL BOUNDARY):
   - Questions and options must be strictly derived from the provided "TEXTBOOK EXCERPT".

6. OFFICIAL TNPSC ENGLISH QUESTION ARCHETYPES & GOLD-STANDARD MODELS:
${examModels}

7. OUTPUT FORMAT:
   Return strictly a JSON object with this exact structure:
   {
     "part": "Part A: General Studies & General Science" | "Part B: Aptitude & Mental Ability",
     "partCode": "partA" | "partB",
     "syllabusUnit": "string describing syllabus topic in English",
     "questionType": "Match the following" | "Statement-based" | "Assertion & Reason" | "Pair matching / Odd one out" | "Aptitude problem" | "Direct MCQ",
     "difficulty": "Easy" | "Moderate" | "Difficult",
     "question": "question text in 100% ENGLISH (use newlines for numbered statements or matching items)",
     "options": {
       "A": "Option text A in English",
       "B": "Option text B in English",
       "C": "Option text C in English",
       "D": "Option text D in English",
       "E": "I don't know"
     },
     "correctAnswer": "A" | "B" | "C" | "D",
     "explanation": "Concise explanation in ENGLISH based ONLY on the textbook excerpt",
     "sourcePage": ${candidatePage.pageNumber},
     "sourceExcerpt": "verbatim quote from the excerpt",
     "verification": {
       "isFactInSource": true,
       "isSingleDefensibleAnswer": true,
       "isFreeOfCorruption": true
     }
   }`;

      let targetPartDirective = '';
      if (requestedPart === 'partA') {
        targetPartDirective = isTamil
          ? `TARGET PART: PART A - GENERAL STUDIES & GENERAL SCIENCE (பொது அறிவியல் & பொது அறிவு)
- You MUST generate a question testing General Science OR Social Studies directly grounded in the excerpt.
- All question text, statements, options A-D, and explanation MUST be in TAMIL.
- Set "part": "Part A: பொது அறிவியல் & பொது அறிவு" and "partCode": "partA".`
          : `TARGET PART: PART A - GENERAL STUDIES & GENERAL SCIENCE
- You MUST generate an authentic TNPSC Group 4 question testing General Science (Physics, Chemistry, Biology) OR Social Science (History, Indian Polity, Geography, Economics) directly grounded in the excerpt.
- All question text, statements, options A-D, and explanation MUST be in ENGLISH.
- Set "part": "Part A: General Studies & General Science" and "partCode": "partA".`;
      } else if (requestedPart === 'partB') {
        targetPartDirective = isTamil
          ? `TARGET PART: PART B - APTITUDE & MENTAL ABILITY (திறனறிவும் மனக்கணக்கு நுண்ணறிவும்)
- You MUST formulate a quantitative, numerical, ratio, percentage, simplification, geometric, or logical reasoning problem based on facts, numbers, dates, spans, counts, or measurements found in the excerpt.
- All question text, options A-D, and explanation MUST be in TAMIL.
- Set "part": "Part B: திறனறிவும் மனக்கணக்கு நுண்ணறிவும்" and "partCode": "partB".`
          : `TARGET PART: PART B - APTITUDE & MENTAL ABILITY
- You MUST formulate a quantitative, numerical, ratio, percentage, geometric, or logical reasoning problem based on facts, numbers, spans, or data in the excerpt.
- All question text, options A-D, and explanation MUST be in ENGLISH.
- Set "part": "Part B: Aptitude & Mental Ability" and "partCode": "partB".`;
      } else if (requestedPart === 'partC') {
        targetPartDirective = `TARGET PART: PART C - GENERAL TAMIL / TAMIL ELIGIBILITY-CUM-SCORING TEST (பொதுத் தமிழ்)
- You MUST generate an authentic question testing பகுதி-அ: இலக்கணம் (Grammar), பகுதி-ஆ: சொல்லகராதி (Vocabulary), or பகுதி-இ: இலக்கியம் மற்றும் தமிழறிஞர்கள் (Literature & Scholars) from the excerpt.
- All question text, options A-D, and explanation MUST be in TAMIL.
- Set "part": "Part C: பொதுத் தமிழ்" and "partCode": "partC".`;
      } else {
        targetPartDirective = isTamil
          ? `TARGET PART: BALANCED EXAMINATION (Auto-detect best fit):
- If excerpt contains Science, History, Polity, Geography -> "part": "Part A: பொது அறிவியல் & பொது அறிவு", "partCode": "partA"
- If excerpt contains Numbers, Calculations, Ratios, Areas, Logic -> "part": "Part B: திறனறிவும் மனக்கணக்கு நுண்ணறிவும்", "partCode": "partB"
- If excerpt contains Tamil Language, Literature, Grammar, Authors -> "part": "Part C: பொதுத் தமிழ்", "partCode": "partC"
- All question text, options A-D, and explanation MUST be in TAMIL.`
          : `TARGET PART: BALANCED EXAMINATION (Auto-detect best fit):
- If excerpt contains Science, History, Polity, Geography -> "part": "Part A: General Studies & General Science", "partCode": "partA"
- If excerpt contains Numbers, Calculations, Ratios, Areas, Logic -> "part": "Part B: Aptitude & Mental Ability", "partCode": "partB"
- If excerpt contains Tamil Language, Literature, Grammar, Authors -> "part": "Part C: General Tamil", "partCode": "partC"
- All question text, options A-D, and explanation MUST be in ENGLISH.`;
      }

      const userPrompt = `=== TNPSC SYLLABUS REFERENCE (EXAM STYLE & SCOPE ONLY) ===
${syllabusGuidance}

=== TEXTBOOK EXCERPT (PAGE ${candidatePage.pageNumber}) ===
${candidatePage.text.slice(0, 3500)}

=== PREVIOUS QUESTIONS IN THIS SESSION (DO NOT DUPLICATE) ===
${recentSummary || 'None yet.'}

=== EXAMINATION PART & MEDIUM REQUIREMENT ===
Target Medium: ${isTamil ? 'TAMIL (தமிழ் வழி)' : 'ENGLISH MEDIUM (ஆங்கில வழி)'}
${targetPartDirective}

TASK:
Generate a fresh, authentic TNPSC Group 4 question in ${isTamil ? 'TAMIL' : 'ENGLISH'} matching the requested part from the excerpt on Page ${candidatePage.pageNumber}.
DO NOT ask about the textbook itself, its layout, activities, or section headings. Test purely the academic subject content. Output ONLY the JSON object.`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          temperature: 0.3,
          topP: 0.85,
          responseMimeType: 'application/json'
        }
      };

      try {
        const response = await this.callGemini(payload);
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]);

        // PRE-DISPLAY VERIFICATION CHECKS (Rule 7 & 8)
        if (
          !parsed.question ||
          !parsed.options?.A ||
          !parsed.options?.B ||
          !parsed.options?.C ||
          !parsed.options?.D ||
          !['A', 'B', 'C', 'D'].includes(parsed.correctAnswer) ||
          !parsed.sourceExcerpt
        ) {
          console.warn('Question failed basic structure validation. Retrying...');
          continue;
        }

        // Sanitize any accidental opening meta-phrasing
        parsed.question = this.sanitizeQuestionText(parsed.question);

        // STRICT ANTI-META VERIFICATION (Reject questions testing the book itself)
        if (this.isMetaQuestion(parsed.question, parsed.options)) {
          console.warn('REJECTED META-TEXTBOOK QUESTION (violates subject content rule):', parsed.question);
          continue;
        }

        // STRICT LANGUAGE VERIFICATION: Enforce 100% medium compliance
        const questionAndOpts = parsed.question + ' ' + (parsed.options?.A || '') + ' ' + (parsed.options?.B || '');
        const hasTamilChars = /[\u0B80-\u0BFF]/.test(questionAndOpts);
        if (!isTamil && hasTamilChars) {
          console.warn(`Attempt ${attempts}: REJECTED QUESTION because English medium is active but Gemini generated Tamil text. Retrying...`);
          continue;
        }
        if (isTamil && !hasTamilChars) {
          console.warn(`Attempt ${attempts}: REJECTED QUESTION because Tamil medium is active but Gemini generated English text. Retrying...`);
          continue;
        }

        // Verify and align excerpt in page text
        const excerptVerified = pdfService.verifyExcerptInPage(
          candidatePage.pageNumber,
          parsed.sourceExcerpt
        );

        if (!excerptVerified) {
          // Automatically align with the closest genuine verbatim sentence on the page
          const matchedSentence = pdfService.findBestMatchingExcerpt(
            candidatePage.pageNumber,
            parsed.sourceExcerpt || parsed.explanation || parsed.question
          );
          if (matchedSentence) {
            parsed.sourceExcerpt = matchedSentence;
          }
        }

        // Ensure Option E is present
        parsed.options.E = isTamil ? 'விடை தெரியவில்லை' : "I don't know";
        parsed.sourcePage = candidatePage.pageNumber;
        parsed.activeSource = activeDoc.filename;

        // Normalize partCode and friendly part title
        if (!parsed.partCode) {
          const pStr = (parsed.part || '').toLowerCase();
          if (pStr.includes('part a') || pStr.includes('அறிவியல்') || pStr.includes('பொது அறிவு') || pStr.includes('science') || pStr.includes('studies')) {
            parsed.partCode = 'partA';
          } else if (pStr.includes('part b') || pStr.includes('திறனறிவு') || pStr.includes('aptitude') || pStr.includes('கணக்கு') || pStr.includes('ability')) {
            parsed.partCode = 'partB';
          } else {
            parsed.partCode = 'partC';
          }
        }

        if (parsed.partCode === 'partA') {
          parsed.part = isTamil ? 'Part A: பொது அறிவியல் & பொது அறிவு' : 'Part A: General Studies & General Science';
        } else if (parsed.partCode === 'partB') {
          parsed.part = isTamil ? 'Part B: திறனறிவும் மனக்கணக்கு நுண்ணறிவும்' : 'Part B: Aptitude & Mental Ability';
        } else {
          parsed.part = isTamil ? 'Part C: பொதுத் தமிழ்' : 'Part C: General Tamil';
        }

        if (!parsed.difficulty) {
          parsed.difficulty = 'Moderate';
        }

        if (!parsed.syllabusUnit || (!isTamil && /[\u0B80-\u0BFF]/.test(parsed.syllabusUnit))) {
          if (isTamil) {
            parsed.syllabusUnit = parsed.partCode === 'partA' 
              ? 'பொது அறிவியல் & பொது அறிவு' 
              : (parsed.partCode === 'partB' ? 'திறனறிவும் மனக்கணக்கு நுண்ணறிவும்' : 'பொதுத் தமிழ்');
          } else {
            parsed.syllabusUnit = parsed.partCode === 'partA'
              ? 'General Studies & General Science'
              : (parsed.partCode === 'partB' ? 'Aptitude & Mental Ability' : 'General Tamil');
          }
        }

        return {
          success: true,
          data: parsed
        };
      } catch (err) {
        console.error(`Attempt ${attempts} question generation failed:`, err.message);
        if (attempts >= maxAttempts) {
          throw new Error('Failed to generate a verified question from the textbook: ' + err.message);
        }
      }
    }

    throw new Error('Could not generate a verified question within maximum attempts. Please try again.');
  }

  /**
   * Check if question is a meta-textbook question (testing the book itself instead of academic subject)
   */
  isMetaQuestion(qText, options = {}) {
    const combined = (qText + ' ' + Object.values(options).join(' ')).toLowerCase();

    const bannedPatterns = [
      // Tamil indexing & unit/chapter meta terms
      /இயல்\s*எண்/i,                // unit number (e.g. இயல் எண் யாது?)
      /அலகு\s*எண்/i,                // unit number
      /பாட(?:ம்)?\s*எண்/i,          // lesson number
      /பக்க\s*எண்/i,                // page number
      /வகுப்பு\s*எண்/i,             // class number
      /அத்தியாய\s*எண்/i,            // chapter number
      /எந்த\s*இயல்/i,               // which unit
      /எந்த\s*அலகு/i,               // which unit
      /எந்த\s*பாடம்/i,              // which lesson
      /எத்தனையாவது\s*இயல்/i,        // which unit number
      /எத்தனையாவது\s*அலகு/i,        // which unit number
      /எத்தனையாவது\s*பாடம்/i,       // which lesson number
      /எந்த\s*வகுப்/i,              // which class
      /எத்தனையாவது\s*வகுப்/i,       // which class number
      /இடம்பெற்றுள்ள\s*இயல்/i,       // unit in which it appears
      /இடம்பெற்றுள்ள\s*அலகு/i,       // unit in which it appears
      /இடம்பெற்றுள்ள\s*பாடம்/i,      // lesson in which it appears
      /தலைப்பிலான\s*பாடம்/i,        // lesson titled ...
      /பாடநூலின்\s*பெயர்/i,          // textbook name
      /பாடநூல்\s*பகுதி/i,           // textbook section

      // Tamil textbook layout & structural section names
      /கவிதைப்பேழை/i,                // textbook poetry section name
      /உரைநடை\s*உலகம்/i,            // textbook prose section name
      /விரிவானம்/i,                  // textbook story section name
      /கற்கண்டு/i,                  // textbook grammar section name
      /நிற்க\s*அதற்குத்\s*தக/i,        // textbook moral action section name
      /விழுமியப்\s*பக்க/i,           // textbook values page name
      /விழுமிய\s*பக்க/i,
      /படித்துச்?\s*சுவைக்க/i,        // textbook reading enjoyment section
      /மொழியோடு\s*விளையாடு/i,        // textbook language fun section
      /மொழிநடையோடு\s*விளையாட/i,
      /பாடநூலின்\s*தலைப்பு/i,
      /தலைப்புகள்\s*மற்றும்\s*செயல்பாடுகள்/i,
      /பாடநூல்\s*வடிவமைப்பு/i,
      /பாடநூல்\s*கட்டமைப்பு/i,
      /பாடநூலின்\s*சிறப்பம்ச/i,
      /பாடநூல்\s*உருவாக்க/i,         // textbook creation
      /பொருளடக்க/i,                 // table of contents
      /உள்ளடக்க/i,
      /விலையில்லா/i,                 // free scheme notice
      /விற்பனைக்கு\s*அன்று/i,
      /கற்றல்\s*நோக்க/i,            // learning objectives
      /கற்றல்\s*விளைவு/i,            // learning outcomes

      // Government notices, textbook publishing disclaimers & pledges
      /தமிழ்நாடு\s*அரசால்\s*வெளியிடப்படும்/i,
      /தமிழ்நாடு\s*அரசு\s*பாடநூல்/i,
      /பாடநூல்கள(?:ில்)?\s*இடம்பெற்றுள்ள/i,
      /பாடநூலில்\s*இடம்பெற்றுள்ள/i,
      /தீண்டாமை\s*மனிதநேயமற்ற/i,
      /தீண்டாமை\s*ஒரு\s*பாவச்செயல்/i,
      /தீண்டாமை\s*ஒரு\s*பெருங்குற்ற/i,
      /தீண்டாமையை\s*ஒழிப்போம்/i,
      /பெருங்குற்றமும்\s*ஆகும்/i,
      /untouchability\s+is\s+a\s+(?:sin|crime|inhuman)/i,

      // English meta & indexing terms
      /\bunit\s*number\b/i,
      /\bchapter\s*number\b/i,
      /\bpage\s*number\b/i,
      /\blesson\s*number\b/i,
      /\bwhich\s*unit\b/i,
      /\bwhich\s*chapter\b/i,
      /\bwhich\s*lesson\b/i,
      /\bwhich\s*class\b/i,
      /\bwhich\s*standard\b/i,
      /\bwhich\s*grade\b/i,
      /\blearning\s*objective/i,
      /\blearning\s*outcome/i,
      /\btextbook\s*layout/i,
      /\bstructure\s*of\s*the\s*textbook/i,
      /\btable\s*of\s*contents/i
    ];

    return bannedPatterns.some(pattern => pattern.test(combined));
  }

  /**
   * Remove any unintentional opening meta-phrasing from question text
   */
  sanitizeQuestionText(qText) {
    if (!qText) return '';
    return qText
      .replace(/\blineWidth\b\s*/gi, '')
      .replace(/^தமிழ்நாடு\s+அரசால்\s+வெளியிடப்படும்\s+பாடநூல்கள(?:ில்)?\s*(?:இடம்பெற்றுள்ள)?[,\s]*/i, '')
      .replace(/^தமிழ்நாடு\s+அரசு\s+பாடநூல்கள(?:ில்)?\s*(?:இடம்பெற்றுள்ள)?[,\s]*/i, '')
      .replace(/^வழங்கப்பட்டுள்ள\s+பாடநூல்\s+பகுதியின்படி[,\s]*/i, '')
      .replace(/^வழங்கப்பட்டுள்ள\s+பாடநூலின்படி[,\s]*/i, '')
      .replace(/^பாடநூல்\s+பகுதியின்படி[,\s]*/i, '')
      .replace(/^பாடநூலின்\s+படி[,\s]*/i, '')
      .replace(/^According to the provided textbook excerpt[,\s]*/i, '')
      .replace(/^According to the textbook[,\s]*/i, '')
      .replace(/^Based on the text[,\s]*/i, '')
      .trim();
  }
}

module.exports = new GeminiService();
