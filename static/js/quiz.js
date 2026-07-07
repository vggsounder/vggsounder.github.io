// Interactive questionnaire: show a clip, let the visitor mark which proposed
// labels are audible and/or visible, then score them against VGGSounder's
// ground-truth modality annotations.
document.addEventListener('DOMContentLoaded', function () {
  const mount = document.getElementById('quiz-app');
  if (!mount) return;

  fetch('./static/data/quiz.json')
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((data) => renderQuiz(mount, data))
    .catch((err) => {
      console.error('Quiz failed to load:', err);
      mount.innerHTML = '<p class="has-text-centered has-text-grey">Could not load the questionnaire.</p>';
    });

  function renderQuiz(root, data) {
    const proposals = data.proposals || [];

    root.innerHTML = `
      <div class="quiz-grid">
        <div class="quiz-video">
          <video controls playsinline preload="none"${data.poster ? ` poster="${data.poster}"` : ''}>
            <source src="${data.video}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <p class="quiz-hint">Watch the clip, then mark every label you can <strong>hear</strong> (🔊)
          and every label you can <strong>see</strong> (👁️). A label can be both, one, or neither.</p>
        </div>
        <div class="quiz-form">
          <div class="quiz-row quiz-head">
            <span class="quiz-label-cell">Label</span>
            <span class="quiz-check-cell">🔊 Audible</span>
            <span class="quiz-check-cell">👁️ Visible</span>
          </div>
          ${proposals.map((p, i) => rowHtml(p, i)).join('')}
          <div class="quiz-actions">
            <button class="button is-link" id="quiz-submit">Check my answers</button>
            <button class="button is-light" id="quiz-reset" style="display:none;">Try again</button>
          </div>
          <div class="quiz-result" id="quiz-result" hidden></div>
        </div>
      </div>
    `;

    function rowHtml(p, i) {
      return `
        <div class="quiz-row" data-row="${i}">
          <span class="quiz-label-cell">${escapeHtml(p.label)}</span>
          <span class="quiz-check-cell">
            <input type="checkbox" data-modality="audible" data-row="${i}" aria-label="audible ${escapeHtml(p.label)}">
            <span class="quiz-mark" data-mark="audible" data-row="${i}"></span>
          </span>
          <span class="quiz-check-cell">
            <input type="checkbox" data-modality="visible" data-row="${i}" aria-label="visible ${escapeHtml(p.label)}">
            <span class="quiz-mark" data-mark="visible" data-row="${i}"></span>
          </span>
        </div>`;
    }

    const submitBtn = root.querySelector('#quiz-submit');
    const resetBtn = root.querySelector('#quiz-reset');
    const resultBox = root.querySelector('#quiz-result');

    submitBtn.addEventListener('click', () => grade());
    resetBtn.addEventListener('click', () => reset());

    function grade() {
      let correct = 0;
      const total = proposals.length * 2;

      proposals.forEach((p, i) => {
        ['audible', 'visible'].forEach((mod) => {
          const box = root.querySelector(`input[data-modality="${mod}"][data-row="${i}"]`);
          const mark = root.querySelector(`.quiz-mark[data-mark="${mod}"][data-row="${i}"]`);
          const userVal = box.checked;
          const truth = !!p[mod];
          const ok = userVal === truth;
          if (ok) correct++;
          mark.textContent = ok ? '✓' : '✗';
          mark.classList.add(ok ? 'is-right' : 'is-wrong');
          box.disabled = true;
          box.parentElement.parentElement.classList.add('is-graded');
        });
        // tag the row with the true modality for the reveal
        const labelCell = root.querySelector(`.quiz-row[data-row="${i}"] .quiz-label-cell`);
        labelCell.classList.add('label', truthClass(p));
        labelCell.innerHTML = `${escapeHtml(p.label)} <span class="quiz-truth">${truthText(p)}</span>`;
      });

      const pct = Math.round((correct / total) * 100);
      resultBox.hidden = false;
      resultBox.className = 'quiz-result ' + (pct >= 80 ? 'is-good' : pct >= 50 ? 'is-mid' : 'is-low');
      resultBox.innerHTML = `
        <strong>${pct}% correct</strong> — you matched ${correct} of ${total} modality decisions.
        Each label now shows its true modality next to it.
        On Mechanical Turk we rejected batches scoring below 45% on hidden gold-standard clips like this one.`;
      submitBtn.style.display = 'none';
      resetBtn.style.display = '';
    }

    function reset() {
      renderQuiz(root, data);
    }

    function truthClass(p) {
      if (p.audible && p.visible) return 'both';
      if (p.audible) return 'audible';
      if (p.visible) return 'visible';
      return 'neither';
    }

    function truthText(p) {
      if (p.audible && p.visible) return 'audible & visible';
      if (p.audible) return 'audible only';
      if (p.visible) return 'visible only';
      return 'not present';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
});
