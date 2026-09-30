require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const pdfService = require('./pdfService');
const geminiService = require('./geminiService');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for PDF file uploads (memory storage, max 50MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported.'));
    }
  }
});

// Single active study session state
const session = {
  currentQuestion: null,
  previousQuestions: [],
  stats: {
    questionNumber: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    accuracy: 0
  }
};

function resetStats() {
  session.currentQuestion = null;
  session.previousQuestions = [];
  session.stats = {
    questionNumber: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    accuracy: 0,
    byPart: {
      partA: { correct: 0, wrong: 0, unanswered: 0, total: 0 },
      partB: { correct: 0, wrong: 0, unanswered: 0, total: 0 },
      partC: { correct: 0, wrong: 0, unanswered: 0, total: 0 }
    }
  };
}

// 1. Status endpoint
app.get('/api/status', (req, res) => {
  const activeDoc = pdfService.getActiveDocument();
  res.json({
    activeDocument: activeDoc,
    stats: session.stats,
    hasPendingQuestion: !!session.currentQuestion,
    currentQuestion: session.currentQuestion
      ? {
          questionNumber: session.stats.questionNumber,
          question: session.currentQuestion.question,
          options: session.currentQuestion.options,
          questionType: session.currentQuestion.questionType,
          difficulty: session.currentQuestion.difficulty || 'Moderate',
          part: session.currentQuestion.part || 'General Studies & Science',
          partCode: session.currentQuestion.partCode || 'partA',
          syllabusUnit: session.currentQuestion.syllabusUnit || 'Subject Knowledge',
          sourcePage: session.currentQuestion.sourcePage
        }
      : null
  });
});

// 2. Upload textbook PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file to upload.' });
    }

    // Reset previous session data on new book upload (SOURCE LOCK)
    resetStats();

    const parsedResult = await pdfService.parsePDF(req.file.buffer, req.file.originalname);
    res.json({
      success: true,
      message: 'Textbook PDF parsed successfully.',
      document: parsedResult
    });
  } catch (err) {
    console.error('Upload parsing error:', err.message);
    res.status(400).json({
      error: err.message || "I couldn't reliably read this PDF. Please try another PDF or a text-readable version."
    });
  }
});

// 3. Generate Next Question
app.post('/api/next-question', async (req, res) => {
  try {
    const activeDoc = pdfService.getActiveDocument();
    if (!activeDoc) {
      return res.status(400).json({ error: 'Please upload a textbook PDF first.' });
    }

    const preferredLanguage = req.body.language || null;
    const requestedPart = req.body.part || 'all';
    const generated = await geminiService.generateQuestion(
      session.previousQuestions,
      preferredLanguage,
      requestedPart
    );

    const questionData = generated.data;
    session.stats.questionNumber++;
    session.currentQuestion = questionData;

    // Send question to user without the answer or explanation (anti-cheat)
    res.json({
      success: true,
      questionNumber: session.stats.questionNumber,
      question: questionData.question,
      options: questionData.options,
      questionType: questionData.questionType,
      difficulty: questionData.difficulty || 'Moderate',
      part: questionData.part || 'General Studies & Science',
      partCode: questionData.partCode || 'partA',
      syllabusUnit: questionData.syllabusUnit || 'Subject Knowledge',
      sourcePage: questionData.sourcePage,
      activeSource: activeDoc.filename,
      stats: session.stats
    });
  } catch (err) {
    console.error('Next question error:', err.message);
    res.status(500).json({
      error: err.message || 'Failed to generate question. Please try again.'
    });
  }
});

// 4. Submit & Evaluate Answer
app.post('/api/submit-answer', (req, res) => {
  try {
    const { selectedAnswer } = req.body;
    if (!session.currentQuestion) {
      return res.status(400).json({ error: 'No question is currently waiting for an answer.' });
    }

    if (!selectedAnswer || !['A', 'B', 'C', 'D', 'E'].includes(selectedAnswer)) {
      return res.status(400).json({ error: 'Invalid answer selection. Choose A, B, C, D, or E.' });
    }

    const currentQ = session.currentQuestion;
    let result = '';

    if (selectedAnswer === 'E') {
      result = 'unanswered';
      session.stats.unanswered++;
    } else if (selectedAnswer === currentQ.correctAnswer) {
      result = 'correct';
      session.stats.correct++;
    } else {
      result = 'wrong';
      session.stats.wrong++;
    }

    const answeredTotal = session.stats.correct + session.stats.wrong;
    session.stats.accuracy = answeredTotal > 0
      ? parseFloat(((session.stats.correct / answeredTotal) * 100).toFixed(1))
      : 0;

    // Update by-part stats breakdown
    if (!session.stats.byPart) {
      session.stats.byPart = {
        partA: { correct: 0, wrong: 0, unanswered: 0, total: 0 },
        partB: { correct: 0, wrong: 0, unanswered: 0, total: 0 },
        partC: { correct: 0, wrong: 0, unanswered: 0, total: 0 }
      };
    }
    const pCode = currentQ.partCode || 'partC';
    if (session.stats.byPart[pCode]) {
      session.stats.byPart[pCode].total++;
      if (result === 'correct') session.stats.byPart[pCode].correct++;
      else if (result === 'wrong') session.stats.byPart[pCode].wrong++;
      else session.stats.byPart[pCode].unanswered++;
    }

    const evaluation = {
      result, // 'correct' | 'wrong' | 'unanswered'
      userAnswer: selectedAnswer,
      correctAnswer: currentQ.correctAnswer,
      explanation: currentQ.explanation,
      sourcePage: currentQ.sourcePage,
      sourceExcerpt: currentQ.sourceExcerpt,
      part: currentQ.part || 'Part C: பொதுத் தமிழ்',
      partCode: currentQ.partCode || 'partC',
      syllabusUnit: currentQ.syllabusUnit || 'பொது',
      questionType: currentQ.questionType || 'Direct MCQ',
      difficulty: currentQ.difficulty || 'Moderate',
      stats: session.stats
    };

    // Save to question history for duplicate prevention
    session.previousQuestions.push({
      question: currentQ.question,
      correctAnswer: currentQ.correctAnswer,
      userAnswer: selectedAnswer,
      result,
      sourcePage: currentQ.sourcePage
    });

    // Clear pending question
    session.currentQuestion = null;

    res.json({
      success: true,
      evaluation
    });
  } catch (err) {
    console.error('Submit answer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. Reset practice session stats
app.post('/api/reset', (req, res) => {
  resetStats();
  res.json({ success: true, stats: session.stats });
});

// 6. Clear active document completely
app.post('/api/clear-document', (req, res) => {
  pdfService.clearActiveDocument();
  resetStats();
  res.json({ success: true, message: 'Active document cleared.' });
});

// Health check endpoint for uptime/Render
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TNPSC Question Practice Agent running at http://0.0.0.0:${PORT}`);
});
