/**
 * Google Apps Script formulario.html behavior — POST /lesson-plans/generate.
 * Auto refreshes dashboard on generate/save.
 */

let objectivesVisible = true;
let gasPlannerReady = false;
let currentOutput = '';
let currentAlunos = [];

function initTables() {
  const inB = document.getElementById('inputBody');
  const outB = document.getElementById('outputBody');
  if (!inB || !outB || gasPlannerReady) return;
  for (let i = 0; i < 10; i++) {
    const trIn = document.createElement('tr');
    for (let j = 0; j < 3; j++) {
      const td = document.createElement('td');
      const div = document.createElement('div');
      div.className = 'gas-editable-cell';
      div.contentEditable = 'true';
      div.dataset.placeholder = j === 0 ? 'Name' : j === 1 ? 'Book' : 'Lesson';
      td.appendChild(div);
      trIn.appendChild(td);
    }
    inB.appendChild(trIn);

    const trOut = document.createElement('tr');
    for (let j = 0; j < 5; j++) {
      const td = document.createElement('td');
      const div = document.createElement('div');
      div.className = 'gas-editable-cell';
      div.contentEditable = 'false';
      if (j === 4) td.classList.add('gas-objectives-cell');
      td.appendChild(div);
      trOut.appendChild(td);
    }
    outB.appendChild(trOut);
  }

  // Save btn removed - auto-save implemented
  gasPlannerReady = true;
}

function setupAiReview() {
  const reviewButton = document.getElementById('aiReviewBtn');
  if (!reviewButton || reviewButton.dataset.bound) return;
  reviewButton.dataset.bound = 'true';
  reviewButton.addEventListener('click', reviewCurrentPlanWithAI);
  document.getElementById('closeAiReviewBtn')?.addEventListener('click', () => {
    document.getElementById('aiReviewPanel')?.classList.add('hidden');
  });
  document.getElementById('copyAiReviewBtn')?.addEventListener('click', copyAiReview);
}

async function reviewCurrentPlanWithAI() {
  const planText = (currentOutput || document.getElementById('output')?.value || '').trim();
  if (!planText) {
    window.UI?.showToast('Gere um plano de aula antes de pedir a revisão da IA.', 'warning');
    return;
  }

  const button = document.getElementById('aiReviewBtn');
  const panel = document.getElementById('aiReviewPanel');
  const output = document.getElementById('aiReviewOutput');
  try {
    window.UI?.setButtonLoading(button, true, 'Analisando...');
    panel?.classList.remove('hidden');
    if (output) output.value = 'A Wiz IA está analisando o plano…';
    const review = await window.API.reviewLessonWithAI(planText);
    if (output) output.value = review.text || '';
  } catch (error) {
    if (output) output.value = '';
    window.UI?.showToast(`Não foi possível gerar as sugestões: ${error.message}`, 'error');
  } finally {
    window.UI?.setButtonLoading(button, false);
  }
}

async function copyAiReview() {
  const output = document.getElementById('aiReviewOutput');
  const text = output?.value?.trim();
  if (!text) return window.UI?.showToast('Ainda não há sugestões para copiar.', 'warning');
  try {
    await navigator.clipboard.writeText(text);
    window.UI?.showToast('Sugestões copiadas.', 'success');
  } catch {
    output.select();
    document.execCommand('copy');
    window.UI?.showToast('Sugestões copiadas.', 'success');
  }
}

document.getElementById('inputBody')?.addEventListener('paste', handlePaste);

function handlePaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text');
  const rows = text.split('\n').filter(r => r.trim());
  const cells = document.querySelectorAll('#inputBody .gas-editable-cell');
  let idx = 0;
  rows.forEach(r => r.split('\t').forEach(col => {
    if (idx < cells.length) cells[idx++].textContent = col.trim();
  }));
}

window.processData = async function() {
  const horario = document.getElementById('horario')?.value || '';
  const lines = Array.from(document.querySelectorAll('#inputBody tr'))
    .map(tr => Array.from(tr.querySelectorAll('.gas-editable-cell')).map(c => c.textContent.trim()).join('\t'))
    .filter(l => l.split('\t').some(x => x));

  if (!lines.length) return window.UI?.showToast('Preencha linhas: Nome TAB Livro TAB Lição', 'warning');

  try {
    const res = await window.API.generateLessonPlan(lines.join('\n'), horario, objectivesVisible);
    currentOutput = res.output || '';
    currentAlunos = lines.map(line => {
      const [nome, livro, lesson] = line.split('\t').map(s => s.trim());
      return {nome, livro, lesson: parseInt(lesson) || 0};
    });
    fillOutput(currentOutput);
    // Auto-save implemented - no manual save button needed
    window.Dashboard?.loadDashboardData?.(true);  // Force immediate update
    window.Rewards?.refreshRewards?.();
    window.UI?.showToast('Plano gerado e salvo automaticamente! Veja Dashboard.', 'success');
  } catch (err) {
    console.error(err);
    window.UI?.showToast(err.message || 'Erro gerar', 'error');
  }
};

function fillOutput(res) {
  const textarea = document.getElementById('output');
  const outBody = document.getElementById('outputBody');
  if (textarea) textarea.value = res;
  if (!outBody) return;
  outBody.innerHTML = '';
  res.split('\n').forEach(line => {
    if (!line.trim()) return;
    const parts = line.split('\t');
    const tr = document.createElement('tr');
    parts.forEach((text, i) => {
      const td = document.createElement('td');
      const div = document.createElement('div');
      div.className = 'gas-editable-cell';
      div.textContent = text;
      td.appendChild(div);
      if (i === 4) {
        td.classList.add('gas-objectives-cell');
        td.classList.toggle('gas-hidden-objectives', !objectivesVisible);
      }
      tr.appendChild(td);
    });
    outBody.appendChild(tr);
  });
}

window.toggleObjectivesColumn = () => {
  objectivesVisible = !objectivesVisible;
  document.querySelectorAll('#outputBody td.gas-objectives-cell').forEach(td => td.classList.toggle('gas-hidden-objectives', !objectivesVisible));
};

window.copiarResultado = () => {
  const ta = document.getElementById('output');
  ta?.select();
  document.execCommand('copy');
  window.UI?.showToast('Copiado!');
};

window.loadSampleData = () => {
  const cells = document.querySelectorAll('#inputBody .gas-editable-cell');
  const sample = 'João\tNW2\t1\nMaria\tNG\t3\nPedro\tPT\t5';
  let i = 0;
  sample.split('\n').forEach(r => r.split('\t').forEach(c => cells[i++] && (cells[i-1].textContent = c)));
  window.UI?.showToast('Sample loaded');
};

window.LessonPlanner = { init() { initTables(); setupAiReview(); } };
