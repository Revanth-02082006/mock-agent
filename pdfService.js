const { PDFParse } = require('pdf-parse');

/**
 * Service to process, extract, clean, and manage the active textbook PDF.
 */
class PDFService {
  constructor() {
    this.activeDocument = null;
  }

  /**
   * Check if extracted text appears corrupted (Rule 8)
   */
  isTextCorrupted(text) {
    if (!text || text.trim().length < 40) return true;

    // Check for excessive replacement characters or unprintable controls
    const unprintable = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
    const unprintableMatches = text.match(unprintable);
    if (unprintableMatches && unprintableMatches.length > Math.max(15, text.length * 0.15)) {
      return true;
    }

    return false;
  }

  /**
   * Detect dominant language of the textbook
   */
  detectLanguage(text) {
    const tamilChars = (text.match(/[\u0B80-\u0BFF]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;

    if (tamilChars > englishChars && tamilChars > 50) {
      return 'ta'; // Tamil
    }
    return 'en'; // English
  }

  /**
   * Clean and normalize raw extracted text, healing detached Tamil vowels/pulli
   */
  cleanText(text) {
    if (!text) return '';
    return text
      .normalize('NFC')
      // Automatically heal detached Tamil vowel signs (ா, ி, ீ, ு, ூ, ெ, ே, ை, ொ, ோ, ௌ, ்)
      // Connect consonants to detached vowel signs/pulli: e.g. "ப ா ட ம்" -> "பாடம்"
      .replace(/([\u0B85-\u0B94\u0B95-\u0BB9])\s+([\u0BBE-\u0BCD])/gu, '$1$2')
      .replace(/\s+([\u0BBE-\u0BCD])/gu, '$1')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Check if a page is purely front matter, table of contents, publisher metadata, or committee lists
   */
  isMetadataOrFrontMatterPage(text, pageNumber = 1, totalPages = 100) {
    if (!text || text.length < 50) return true;
    const lower = text.toLowerCase();

    // Opening preliminary pages (typically pages 1 to 10 of a textbook)
    const isOpeningSection = pageNumber <= 10;
    // End matter committee lists (last 4 pages of the book)
    const isEndSection = totalPages > 15 && pageNumber >= totalPages - 4;

    if (isOpeningSection || isEndSection) {
      // 1. Committee lists & publishing details
      const committeeKeywords = [
        'பாடநூல் உருவாக்கக் குழு',
        'பாடநூல் தயாரிப்புக் குழு',
        'ஆசிரியர்கள் குழு',
        'பாட ஒருங்கிணைப்பாளர்',
        'பாடநூல் உருவாக்க ஒருங்கிணைப்பு',
        'textbook development team',
        'review committee',
        'editorial board',
        'advisory committee',
        'state council of educational research and training',
        'தமிழ்நாடு பாடநூல் மற்றும் கல்வியியல் பணிகள் கழகம்'
      ];
      if (committeeKeywords.some(k => lower.includes(k.toLowerCase()))) {
        return true;
      }

      // 2. Preliminary anthems, pledges, or disclaimers
      const prelimKeywords = [
        'பொருளடக்கம்',
        'உள்ளடக்கம்',
        'table of contents',
        'தமிழ்த்தாய் வாழ்த்து',
        'நாட்டுப்பண்',
        'தேசிய ஒருமைப்பாட்டு உறுதிமொழி',
        'தீண்டாமை மனிதநேயமற்ற',
        'தீண்டாமை ஒரு பாவச்செயல்',
        'தீண்டாமை ஒரு பெருங்குற்றம்',
        'தீண்டாமையை ஒழிப்போம்',
        'பெருங்குற்றமும் ஆகும்',
        'untouchability is a sin',
        'untouchability is a crime',
        'untouchability is inhuman',
        'பாடநூலைப் பயன்படுத்துவது எப்படி',
        'பாடநூல் வடிவமைப்பு',
        'பாடநூல் கட்டமைப்பு',
        'நூலின் அமைப்பு',
        'பாடநூலின் சிறப்பம்சங்கள்',
        'how to use this book',
        'structure of the textbook'
      ];
      if (prelimKeywords.some(k => lower.includes(k.toLowerCase()))) {
        return true;
      }

      // 3. Title/Copyright page (short text containing publisher/free notice)
      const wordsCount = text.split(/\s+/).length;
      if (wordsCount < 80 && (lower.includes('விலையில்லாப் பாடநூல்') || lower.includes('விற்பனைக்கு அன்று') || lower.includes('not for sale'))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Strip meta-textbook noise: running headers/footers, learning objectives, class titles
   */
  stripTextbookMetaNoise(text) {
    if (!text) return '';
    let cleaned = text;

    // Remove government running footers & headers (printed across all pages of state textbooks)
    cleaned = cleaned.replace(/.*(?:விலையில்லாப்\s*பாடநூல்|விலையின்றி\s*வழங்கப்படுகின்றது|விற்பனைக்கு\s*அன்று|not\s*for\s*sale|free\s*textbook).*/gmi, '');
    cleaned = cleaned.replace(/.*(?:தமிழ்நாடு\s*அரசு\s*விலையில்லா|தமிழ்நாடு\s*அரசால்\s*வெளியிடப்படும்|தீண்டாமை\s*மனிதநேயமற்ற|தீண்டாமை\s*ஒரு\s*பாவச்செயல்|தீண்டாமை\s*ஒரு\s*பெருங்குற்றம்).*/gmi, '');

    // Remove "கற்றல் நோக்கங்கள்: ..." blocks
    cleaned = cleaned.replace(/கற்றல் நோக்கங்கள்[\s\S]*?(?=\n\n[^\n]|\n[A-Z\u0B80-\u0BFF]{2,}|$)/gi, '');
    cleaned = cleaned.replace(/Learning Outcomes?[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '');
    cleaned = cleaned.replace(/Learning Objectives?[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '');

    // Remove textbook section headers if alone on a line
    cleaned = cleaned.replace(/^(?:கவிதைப்பேழை|உரைநடை உலகம்|விரிவானம்|கற்கண்டு|நிற்க அதற்குத் தக|மொழியோடு விளையாடு|படித்துச் சுவைக்க)\s*$/gmi, '');

    // Remove standard running headers like "தமிழ் - எட்டாம் வகுப்பு", "வகுப்பு: 8"
    cleaned = cleaned.replace(/^(?:தமிழ்|அறிவியல்|சமூக அறிவியல்)\s*[-–]\s*(?:வகுப்பு|ஆம் வகுப்பு).*/gmi, '');
    cleaned = cleaned.replace(/^(?:Standard|Class)\s*(?:[IVXLCDM]+|\d+).*/gmi, '');
    cleaned = cleaned.replace(/^(?:இயல்|Unit|Chapter)\s*\d+[\s:–-].*/gmi, '');

    return cleaned.trim();
  }

  /**
   * Parse uploaded PDF buffer into structured document
   */
  async parsePDF(buffer, filename) {
    let parser = null;
    try {
      parser = new PDFParse({ data: buffer });
      await parser.load();
      const info = await parser.getInfo();
      const textResult = await parser.getText();

      const rawPages = textResult.pages || [];
      const totalPages = rawPages.length || info.total || 0;

      if (totalPages === 0) {
        throw new Error('PDF has 0 pages or could not be decoded.');
      }

      const validPages = [];
      let totalExtractedLength = 0;
      let sampleCombinedText = '';

      for (let i = 0; i < rawPages.length; i++) {
        const pageNum = rawPages[i].num || i + 1;
        const cleaned = this.cleanText(rawPages[i].text);
        const isCorrupt = this.isTextCorrupted(cleaned);
        const isFrontMatter = this.isMetadataOrFrontMatterPage(cleaned, pageNum, totalPages);

        // Keep page if it has substantive content, isn't corrupted, and isn't front matter
        if (cleaned.length >= 60 && !isCorrupt && !isFrontMatter) {
          const contentOnly = this.stripTextbookMetaNoise(cleaned);
          validPages.push({
            pageNumber: pageNum,
            text: contentOnly.length > 40 ? contentOnly : cleaned,
            originalText: cleaned,
            wordCount: cleaned.split(/\s+/).length,
            usedCount: 0
          });
          totalExtractedLength += cleaned.length;
          if (sampleCombinedText.length < 5000) {
            sampleCombinedText += ' ' + cleaned;
          }
        }
      }

      if (validPages.length === 0 || totalExtractedLength < 100) {
        throw new Error(
          "I couldn't reliably read text from this PDF. It may be scanned images or corrupted. Please try another PDF or a text-readable version."
        );
      }

      const language = this.detectLanguage(sampleCombinedText);

      // SOURCE LOCK: Replace active document completely. Only one active PDF.
      this.activeDocument = {
        filename,
        totalPages,
        validPageCount: validPages.length,
        language,
        pages: validPages,
        uploadedAt: new Date().toISOString()
      };

      return {
        success: true,
        filename,
        totalPages,
        readablePages: validPages.length,
        language: language === 'ta' ? 'தமிழ் (Tamil)' : 'English',
        languageCode: language
      };
    } finally {
      if (parser && typeof parser.destroy === 'function') {
        try {
          await parser.destroy();
        } catch (_) {}
      }
    }
  }

  /**
   * Get active document status
   */
  getActiveDocument() {
    if (!this.activeDocument) return null;
    return {
      filename: this.activeDocument.filename,
      totalPages: this.activeDocument.totalPages,
      readablePages: this.activeDocument.validPageCount,
      language: this.activeDocument.language,
      languageLabel: this.activeDocument.language === 'ta' ? 'தமிழ் (Tamil)' : 'English',
      uploadedAt: this.activeDocument.uploadedAt
    };
  }

  /**
   * Clear active document
   */
  clearActiveDocument() {
    this.activeDocument = null;
  }

  /**
   * Select candidate page for next question, prioritizing domain matches and less frequently used pages
   * @param {number[]} avoidPageNumbers - Pages already attempted in current cycle
   * @param {string} requestedPart - 'all' | 'partA' | 'partB' | 'partC'
   */
  selectCandidatePage(avoidPageNumbers = [], requestedPart = 'all') {
    if (!this.activeDocument || !this.activeDocument.pages.length) {
      return null;
    }

    // Filter out pages that are in avoid list or match metadata/layout/front-matter
    const totalPages = this.activeDocument.totalPages || 100;
    const nonMetaPages = this.activeDocument.pages.filter(p => {
      if (this.isMetadataOrFrontMatterPage(p.text, p.pageNumber, totalPages)) return false;
      if (p.originalText && this.isMetadataOrFrontMatterPage(p.originalText, p.pageNumber, totalPages)) return false;
      return true;
    });

    const candidatePool = nonMetaPages.length > 0 ? nonMetaPages : this.activeDocument.pages;

    const available = candidatePool.filter(
      p => !avoidPageNumbers.includes(p.pageNumber)
    );

    const pool = available.length > 0 ? available : candidatePool;

    // If a specific exam part is requested, score pages to find the best domain match
    if (requestedPart && requestedPart !== 'all') {
      const scored = pool.map(p => {
        let score = 0;
        const textToScan = (p.text + ' ' + (p.originalText || '')).toLowerCase();

        if (requestedPart === 'partA') {
          // Part A: General Science & General Studies (Physics, Chemistry, Biology, History, Polity, Geography, Economy)
          const scienceAndStudiesPatterns = [
            /அறிவியல்|இயற்பியல்|வேதியியல்|உயிரியல்|தாவர|விலங்கு|விசை|இயக்கம்|ஒளி|ஒலி|வெப்ப|மின்/g,
            /காந்த|அணு|தனிம|சேர்ம|அமில|கார|உப்பு|உர|வைட்டமின்|நோய்|உறுப்பு|சுற்றுச்சூழல்/g,
            /வரலாறு|நாகரிக|சிந்து|சோழ|பாண்டிய|பல்லவ|சுல்தான்|முகலாய|புரட்சி|காந்தி|நேரு|அம்பேத்கர்|பாரதி/g,
            /அரசியலமைப்பு|குடியரசு|நாடாளுமன்ற|சட்டமன்ற|பஞ்சாயத்து|நீதித்துறை|ஆட்சியியல்|உரிமைகள்|சட்டம்/g,
            /புவியியல்|மழை|ஆறு|மண்|காடு|மக்கள்\s*தொகை|பொருளாதார|வங்கி|திட்டம்/g,
            /science|physics|chemistry|biology|force|motion|energy|light|heat|acid|base|salt|cell|disease/gi,
            /history|polity|geography|constitution|parliament|monsoon|river|forest|economy/gi
          ];
          for (const pat of scienceAndStudiesPatterns) {
            const matches = textToScan.match(pat);
            if (matches) score += matches.length * 4;
          }
        } else if (requestedPart === 'partB') {
          // Part B: Aptitude & Mental Ability (Calculations, percentages, ratios, geometry, series, logical reasoning)
          const mathPatterns = [
            /கணக்|கணித|விழுக்காடு|சதவீத|விகித|வட்டி|பரப்பளவு|கனஅளவு|மீ\.பொ|சுருக்கு|லாப|நட்ட/g,
            /முக்கோண|வட்ட|சதுர|செவ்வக|உருளை|கூம்பு|வேலை|நாட்கள்|மணி|தூரம்|வேகம்/g,
            /தொடர்|எண்|விடுபட்ட|காரணவியல்|புதிர்|பகடை/g,
            /percent|ratio|proportion|interest|area|volume|perimeter|simplification|series|puzzle|dice|reasoning/gi
          ];
          for (const pat of mathPatterns) {
            const matches = textToScan.match(pat);
            if (matches) score += matches.length * 5;
          }
          // Reward presence of digits and numbers
          const digits = textToScan.match(/\d+/g);
          if (digits) score += Math.min(digits.length, 12);
        } else if (requestedPart === 'partC') {
          // Part C: General Tamil / Tamil Eligibility (Grammar, vocabulary, literature, scholars)
          const tamilPatterns = [
            /இலக்கண|வேர்ச்சொல்|பெயர்ச்சொல்|வினைச்சொல்|ஆகுபெயர்|சந்திப்பிழை|எதிர்ச்சொல்|பொருத்துக/g,
            /திருக்குறள்|குறள்|பாடல்|செய்யுள்|நூல்|கவிஞர்|புலவர்|காப்பிய|கம்ப|பாரதி|வள்ளுவர்|அறநூல்/g,
            /உவமை|மரபு|சொல்லும்\s*பொருளும்|ஓரெழுத்து|பிரித்து|சேர்த்து/g
          ];
          for (const pat of tamilPatterns) {
            const matches = textToScan.match(pat);
            if (matches) score += matches.length * 3;
          }
        }

        return { page: p, score };
      });

      const matching = scored.filter(s => s.score > 0);
      if (matching.length > 0) {
        matching.sort((a, b) => b.score - a.score || a.page.usedCount - b.page.usedCount);
        const topPool = matching.slice(0, 4).map(s => s.page);
        const selected = topPool[Math.floor(Math.random() * topPool.length)];
        selected.usedCount++;
        return selected;
      }
    }

    // Default: Sort by usedCount ascending, then pick randomly from the least used pages
    pool.sort((a, b) => a.usedCount - b.usedCount);
    const minUsed = pool[0].usedCount;
    const candidates = pool.filter(p => p.usedCount <= minUsed + 1);

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    selected.usedCount++;
    return selected;
  }

  /**
   * Verify if a source excerpt actually exists in the page text
   */
  verifyExcerptInPage(pageNum, excerpt) {
    if (!this.activeDocument || !excerpt) return false;
    const page = this.activeDocument.pages.find(p => p.pageNumber === pageNum);
    if (!page) return false;

    const normalizeForSearch = str =>
      str
        .normalize('NFC')
        .toLowerCase()
        .replace(/[\s\p{P}]+/gu, ' ')
        .trim();

    const normalizedPage = normalizeForSearch(page.text);
    const normalizedExcerpt = normalizeForSearch(excerpt);

    if (normalizedExcerpt.length < 6) return false;

    if (normalizedPage.includes(normalizedExcerpt)) {
      return true;
    }

    const words = normalizedExcerpt.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
      let matchCount = 0;
      for (const w of words) {
        if (normalizedPage.includes(w)) matchCount++;
      }
      if (matchCount / words.length >= 0.45) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract the closest matching verbatim sentence from the page
   */
  findBestMatchingExcerpt(pageNum, textSnippet) {
    if (!this.activeDocument || !textSnippet) return textSnippet;
    const page = this.activeDocument.pages.find(p => p.pageNumber === pageNum);
    if (!page) return textSnippet;

    const sentences = page.text
      .split(/(?<=[.?!।\n])/)
      .map(s => s.trim())
      .filter(s => s.length > 25);

    if (sentences.length === 0) return textSnippet;

    const queryWords = new Set(
      textSnippet
        .toLowerCase()
        .replace(/[\s\p{P}]+/gu, ' ')
        .split(' ')
        .filter(w => w.length > 2)
    );

    let bestSentence = sentences[0];
    let maxOverlap = -1;

    for (const s of sentences) {
      const sWords = s
        .toLowerCase()
        .replace(/[\s\p{P}]+/gu, ' ')
        .split(' ')
        .filter(w => w.length > 2);

      let overlap = 0;
      for (const sw of sWords) {
        if (queryWords.has(sw)) overlap++;
      }

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSentence = s;
      }
    }

    return bestSentence || textSnippet;
  }
}

module.exports = new PDFService();
