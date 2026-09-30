/**
 * TNPSC Question Practice Agent - Frontend Application Logic
 */

// Dynamic API Base URL (defaults to current origin for Render / localhost, or uses window.EXAM_AGENT_API_URL if hosted on Firebase)
const API_BASE = (window.EXAM_AGENT_API_URL || '').replace(/\/$/, '');

document.addEventListener('DOMContentLoaded', () => {
  // Screens
  const uploadScreen = document.getElementById('uploadScreen');
  const practiceScreen = document.getElementById('practiceScreen');

  // Header Elements
  const activeSourceBar = document.getElementById('activeSourceBar');
  const activeSourceFilename = document.getElementById('activeSourceFilename');
  const changePdfBtn = document.getElementById('changePdfBtn');

  // Upload Screen Elements
  const dropZone = document.getElementById('dropZone');
  const pdfFileInput = document.getElementById('pdfFileInput');
  const uploadStatus = document.getElementById('uploadStatus');
  const uploadSuccessCard = document.getElementById('uploadSuccessCard');
  const selectedFilename = document.getElementById('selectedFilename');
  const docPagesTag = document.getElementById('docPagesTag');
  const docLangTag = document.getElementById('docLangTag');
  const startPracticeBtn = document.getElementById('startPracticeBtn');
  const uploadError = document.getElementById('uploadError');
  const uploadErrorText = document.getElementById('uploadErrorText');

  // Progress Metrics
  const statQuestionNum = document.getElementById('statQuestionNum');
  const statCorrect = document.getElementById('statCorrect');
  const statWrong = document.getElementById('statWrong');
  const statUnanswered = document.getElementById('statUnanswered');
  const statAccuracy = document.getElementById('statAccuracy');

  // Question Card Elements
  const questionLoading = document.getElementById('questionLoading');
  const questionCard = document.getElementById('questionCard');
  const examPartBadge = document.getElementById('examPartBadge');
  const syllabusUnitBadge = document.getElementById('syllabusUnitBadge');
  const questionTypeBadge = document.getElementById('questionTypeBadge');
  const difficultyBadge = document.getElementById('difficultyBadge');
  const sourcePageBadge = document.getElementById('sourcePageBadge');
  const displayQNum = document.getElementById('displayQNum');
  const questionText = document.getElementById('questionText');
  const optionsForm = document.getElementById('optionsForm');
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');

  // Part Selector Pills
  const partPills = document.querySelectorAll('.part-pill');
  let selectedPart = 'all';

  const optionItems = {
    A: document.getElementById('optionItemA'),
    B: document.getElementById('optionItemB'),
    C: document.getElementById('optionItemC'),
    D: document.getElementById('optionItemD'),
    E: document.getElementById('optionItemE')
  };

  const optionInputs = {
    A: document.getElementById('optA'),
    B: document.getElementById('optB'),
    C: document.getElementById('optC'),
    D: document.getElementById('optD'),
    E: document.getElementById('optE')
  };

  const optionTexts = {
    A: document.getElementById('optTextA'),
    B: document.getElementById('optTextB'),
    C: document.getElementById('optTextC'),
    D: document.getElementById('optTextD'),
    E: document.getElementById('optTextE')
  };

  // Evaluation Card Elements
  const evaluationCard = document.getElementById('evaluationCard');
  const evalBanner = document.getElementById('evalBanner');
  const evalIcon = document.getElementById('evalIcon');
  const evalTitle = document.getElementById('evalTitle');
  const evalSubtitle = document.getElementById('evalSubtitle');
  const evalUserAnswer = document.getElementById('evalUserAnswer');
  const evalCorrectAnswer = document.getElementById('evalCorrectAnswer');
  const evalExplanationText = document.getElementById('evalExplanationText');
  const evidencePageBadge = document.getElementById('evidencePageBadge');
  const evidenceQuote = document.getElementById('evidenceQuote');
  const evalPartBadge = document.getElementById('evalPartBadge');
  const evalUnitBadge = document.getElementById('evalUnitBadge');
  const nextQuestionBtn = document.getElementById('nextQuestionBtn');

  // Application State
  let currentSelectedOption = null;
  let isAnswerSubmitted = false;
  let isLoadingQuestion = false;

  // Initialize Part Selector Pills
  partPills.forEach(pill => {
    pill.addEventListener('click', () => {
      partPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-selected', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-selected', 'true');
      selectedPart = pill.dataset.part || 'all';

      // If already on practice screen and answer submitted, generate next question for this part immediately
      if (!practiceScreen.classList.contains('hidden') && isAnswerSubmitted) {
        fetchNextQuestion();
      }
    });
  });

  // Medium / Language Selector Pills
  const mediumPills = document.querySelectorAll('.medium-pill');
  let selectedLanguage = 'auto';

  mediumPills.forEach(pill => {
    pill.addEventListener('click', () => {
      mediumPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-selected', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-selected', 'true');
      selectedLanguage = pill.dataset.lang || 'auto';

      // If already on practice screen and answer submitted, generate next question in this medium immediately
      if (!practiceScreen.classList.contains('hidden') && isAnswerSubmitted) {
        fetchNextQuestion();
      }
    });
  });

  // -------------------------------------------------------------
  // Initial Status Check
  // -------------------------------------------------------------
  checkInitialStatus();

  async function checkInitialStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      if (data.activeDocument) {
        updateActiveDocumentUI(data.activeDocument);
        updateStatsUI(data.stats);
        if (data.hasPendingQuestion && data.currentQuestion) {
          showPracticeScreen();
          renderQuestion(data.currentQuestion);
        } else {
          // Document exists, ready to start
          selectedFilename.textContent = data.activeDocument.filename;
          const total = data.activeDocument.totalPages || data.activeDocument.readablePages;
          const readable = data.activeDocument.readablePages;
          docPagesTag.textContent = total > readable
            ? `${total} Pages (${readable} Lessons)`
            : `${readable} Pages`;
          docLangTag.textContent = data.activeDocument.languageLabel;
          uploadSuccessCard.classList.remove('hidden');
        }
      }
    } catch (err) {
      console.warn('Initial status check failed:', err);
    }
  }

  // -------------------------------------------------------------
  // File Upload Handling
  // -------------------------------------------------------------
  dropZone.addEventListener('click', () => pdfFileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pdfFileInput.click();
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  pdfFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  async function handleFileSelected(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showUploadError('Please select a valid PDF file.');
      return;
    }

    hideUploadError();
    uploadStatus.classList.remove('hidden');
    uploadSuccessCard.classList.add('hidden');

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      uploadStatus.classList.add('hidden');

      if (!res.ok || !data.success) {
        showUploadError(data.error || 'Failed to read PDF.');
        return;
      }

      selectedFilename.textContent = data.document.filename;
      const total = data.document.totalPages || data.document.readablePages;
      const readable = data.document.readablePages;
      docPagesTag.textContent = total > readable
        ? `${total} Pages (${readable} Lessons)`
        : `${readable} Pages`;
      docLangTag.textContent = data.document.language;
      uploadSuccessCard.classList.remove('hidden');

      updateActiveDocumentUI({
        filename: data.document.filename,
        totalPages: data.document.totalPages,
        readablePages: data.document.readablePages,
        languageLabel: data.document.language
      });
    } catch (err) {
      uploadStatus.classList.add('hidden');
      showUploadError('Network error uploading PDF: ' + err.message);
    }
  }

  function showUploadError(msg) {
    uploadErrorText.textContent = msg;
    uploadError.classList.remove('hidden');
  }

  function hideUploadError() {
    uploadError.classList.add('hidden');
  }

  function updateActiveDocumentUI(doc) {
    if (!doc) {
      activeSourceBar.classList.add('hidden');
      return;
    }
    activeSourceFilename.textContent = doc.filename;
    activeSourceFilename.title = doc.filename;
    activeSourceBar.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // Start Practice & Screen Transition
  // -------------------------------------------------------------
  startPracticeBtn.addEventListener('click', () => {
    showPracticeScreen();
    fetchNextQuestion();
  });

  changePdfBtn.addEventListener('click', () => {
    if (confirm('Switching books will reset the current practice session. Continue?')) {
      showUploadScreen();
      fetch(`${API_BASE}/api/clear-document`, { method: 'POST' }).catch(() => {});
    }
  });

  function showPracticeScreen() {
    uploadScreen.classList.add('hidden');
    practiceScreen.classList.remove('hidden');
  }

  function showUploadScreen() {
    practiceScreen.classList.add('hidden');
    uploadScreen.classList.remove('active', 'hidden');
    uploadScreen.classList.add('active');
    activeSourceBar.classList.add('hidden');
    uploadSuccessCard.classList.add('hidden');
    pdfFileInput.value = '';
    resetOptionState();
  }

  // -------------------------------------------------------------
  // Fetch Next Question
  // -------------------------------------------------------------
  async function fetchNextQuestion() {
    if (isLoadingQuestion) return;
    isLoadingQuestion = true;

    // UI state while generating
    evaluationCard.classList.add('hidden');
    questionCard.classList.add('hidden');
    questionLoading.classList.remove('hidden');
    resetOptionState();

    let seconds = 0;
    const loadingSubtext = document.getElementById('loadingSubtext');
    if (loadingSubtext) {
      loadingSubtext.textContent = 'Reading textbook content and selecting topic...';
    }

    const progressTimer = setInterval(() => {
      seconds++;
      if (!loadingSubtext) return;
      if (seconds === 2) {
        loadingSubtext.textContent = 'Crafting TNPSC-style question & options...';
      } else if (seconds === 4) {
        loadingSubtext.textContent = 'Verifying factual source evidence against page...';
      } else if (seconds >= 6) {
        loadingSubtext.textContent = 'Finalizing question presentation...';
      }
    }, 1000);

    try {
      const langPayload = selectedLanguage === 'auto' ? null : selectedLanguage;
      const res = await fetch(`${API_BASE}/api/next-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part: selectedPart, language: langPayload })
      });

      clearInterval(progressTimer);
      const data = await res.json();
      questionLoading.classList.add('hidden');
      isLoadingQuestion = false;

      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to generate question. Please try again.');
        questionCard.classList.remove('hidden');
        return;
      }

      renderQuestion(data);
      updateStatsUI(data.stats);
    } catch (err) {
      clearInterval(progressTimer);
      questionLoading.classList.add('hidden');
      isLoadingQuestion = false;
      alert('Error fetching question: ' + err.message);
      questionCard.classList.remove('hidden');
    }
  }

  // -------------------------------------------------------------
  // Render Question
  // -------------------------------------------------------------
  function renderQuestion(q) {
    displayQNum.textContent = `Q${q.questionNumber || statQuestionNum.textContent}.`;
    questionText.textContent = q.question;

    if (examPartBadge) {
      examPartBadge.textContent = q.part || 'General Studies & Science';
      examPartBadge.className = 'badge badge-part';
      if (q.partCode === 'partA') {
        examPartBadge.classList.add('badge-part-a');
      } else if (q.partCode === 'partB') {
        examPartBadge.classList.add('badge-part-b');
      } else {
        examPartBadge.classList.add('badge-part-c');
      }
    }

    if (syllabusUnitBadge) {
      syllabusUnitBadge.textContent = q.syllabusUnit || 'பொது';
    }

    questionTypeBadge.textContent = q.questionType || 'Direct MCQ';
    difficultyBadge.textContent = q.difficulty || 'Moderate';
    sourcePageBadge.textContent = `Page ${q.sourcePage || '—'}`;

    // Options A, B, C, D, E
    optionTexts.A.textContent = q.options.A || '';
    optionTexts.B.textContent = q.options.B || '';
    optionTexts.C.textContent = q.options.C || '';
    optionTexts.D.textContent = q.options.D || '';
    optionTexts.E.textContent = q.options.E || "விடை தெரியவில்லை (I don't know)";

    resetOptionState();
    questionCard.classList.remove('hidden');
    submitAnswerBtn.disabled = true;
    isAnswerSubmitted = false;

    // Scroll smoothly to question
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // -------------------------------------------------------------
  // Option Selection
  // -------------------------------------------------------------
  Object.keys(optionItems).forEach((key) => {
    optionItems[key].addEventListener('click', () => {
      if (isAnswerSubmitted) return;
      selectOption(key);
    });
  });

  function selectOption(key) {
    if (isAnswerSubmitted) return;
    currentSelectedOption = key;

    // Update radio and classes
    Object.keys(optionItems).forEach((k) => {
      optionItems[k].classList.remove('selected');
      optionInputs[k].checked = (k === key);
    });

    optionItems[key].classList.add('selected');
    submitAnswerBtn.disabled = false;
  }

  function resetOptionState() {
    currentSelectedOption = null;
    isAnswerSubmitted = false;
    submitAnswerBtn.disabled = true;

    Object.keys(optionItems).forEach((k) => {
      optionItems[k].classList.remove('selected', 'correct-choice', 'wrong-choice');
      optionInputs[k].checked = false;
      optionInputs[k].disabled = false;
    });
  }

  // -------------------------------------------------------------
  // Submit Answer
  // -------------------------------------------------------------
  submitAnswerBtn.addEventListener('click', submitCurrentAnswer);

  async function submitCurrentAnswer() {
    if (!currentSelectedOption || isAnswerSubmitted) return;
    isAnswerSubmitted = true;
    submitAnswerBtn.disabled = true;

    // Disable radio inputs
    Object.keys(optionInputs).forEach(k => optionInputs[k].disabled = true);

    try {
      const res = await fetch(`${API_BASE}/api/submit-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAnswer: currentSelectedOption })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Evaluation failed.');
        isAnswerSubmitted = false;
        submitAnswerBtn.disabled = false;
        return;
      }

      displayEvaluation(data.evaluation);
      updateStatsUI(data.evaluation.stats);
    } catch (err) {
      alert('Error submitting answer: ' + err.message);
      isAnswerSubmitted = false;
      submitAnswerBtn.disabled = false;
    }
  }

  // -------------------------------------------------------------
  // Display Evaluation & Source Evidence
  // -------------------------------------------------------------
  function displayEvaluation(evalData) {
    evalBanner.className = 'eval-banner';

    // Highlight options on the card
    const userChoice = evalData.userAnswer;
    const correctChoice = evalData.correctAnswer;

    if (evalData.result === 'correct') {
      evalBanner.classList.add('banner-correct');
      evalIcon.textContent = '✅';
      evalTitle.textContent = 'சரியான விடை! (Correct)';
      evalSubtitle.textContent = 'Your answer matches the textbook source perfectly.';
      if (optionItems[userChoice]) {
        optionItems[userChoice].classList.add('correct-choice');
      }
    } else if (evalData.result === 'wrong') {
      evalBanner.classList.add('banner-wrong');
      evalIcon.textContent = '❌';
      evalTitle.textContent = 'தவறான விடை (Incorrect)';
      evalSubtitle.textContent = 'Review the source explanation and evidence below.';
      if (optionItems[userChoice]) {
        optionItems[userChoice].classList.add('wrong-choice');
      }
      if (optionItems[correctChoice]) {
        optionItems[correctChoice].classList.add('correct-choice');
      }
    } else {
      // Unanswered (Option E)
      evalBanner.classList.add('banner-unanswered');
      evalIcon.textContent = 'ℹ️';
      evalTitle.textContent = 'விடை தெரியவில்லை (Unanswered)';
      evalSubtitle.textContent = 'Skipped without penalty. Review the correct answer below.';
      if (optionItems[correctChoice]) {
        optionItems[correctChoice].classList.add('correct-choice');
      }
    }

    evalUserAnswer.textContent = `Option ${userChoice} (${optionTexts[userChoice].textContent})`;
    evalCorrectAnswer.textContent = `Option ${correctChoice} (${optionTexts[correctChoice].textContent})`;
    evalExplanationText.textContent = evalData.explanation;

    if (evalPartBadge) {
      evalPartBadge.textContent = evalData.part || 'General Studies & Science';
      evalPartBadge.className = 'badge badge-part';
      if (evalData.partCode === 'partA') {
        evalPartBadge.classList.add('badge-part-a');
      } else if (evalData.partCode === 'partB') {
        evalPartBadge.classList.add('badge-part-b');
      } else {
        evalPartBadge.classList.add('badge-part-c');
      }
    }

    if (evalUnitBadge) {
      evalUnitBadge.textContent = evalData.syllabusUnit || 'பொது';
    }

    evidencePageBadge.textContent = `Page ${evalData.sourcePage}`;
    evidenceQuote.textContent = `"${evalData.sourceExcerpt}"`;

    evaluationCard.classList.remove('hidden');

    // Scroll down to evaluation
    evaluationCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // -------------------------------------------------------------
  // Next Question Button
  // -------------------------------------------------------------
  nextQuestionBtn.addEventListener('click', () => {
    fetchNextQuestion();
  });

  // -------------------------------------------------------------
  // Update Minimal Progress Stats (Rule 18)
  // -------------------------------------------------------------
  function updateStatsUI(stats) {
    if (!stats) return;
    statQuestionNum.textContent = stats.questionNumber || 1;
    statCorrect.textContent = stats.correct || 0;
    statWrong.textContent = stats.wrong || 0;
    statUnanswered.textContent = stats.unanswered || 0;
    statAccuracy.textContent = `${stats.accuracy || 0}%`;
  }

  // -------------------------------------------------------------
  // Keyboard Shortcuts (A-E / 1-5, Enter)
  // -------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    // If user is typing in an input field, ignore
    if (e.target.tagName === 'INPUT' && e.target.type !== 'radio') return;

    const key = e.key.toUpperCase();

    // Option Keys: A, B, C, D, E or 1, 2, 3, 4, 5
    const keyMap = {
      '1': 'A', 'A': 'A',
      '2': 'B', 'B': 'B',
      '3': 'C', 'C': 'C',
      '4': 'D', 'D': 'D',
      '5': 'E', 'E': 'E'
    };

    if (keyMap[key] && !isAnswerSubmitted && !practiceScreen.classList.contains('hidden')) {
      selectOption(keyMap[key]);
      return;
    }

    // Enter Key Handler
    if (e.key === 'Enter') {
      if (!practiceScreen.classList.contains('hidden')) {
        if (!isAnswerSubmitted && currentSelectedOption) {
          submitCurrentAnswer();
        } else if (isAnswerSubmitted && !evaluationCard.classList.contains('hidden')) {
          fetchNextQuestion();
        }
      }
    }
  });
});
