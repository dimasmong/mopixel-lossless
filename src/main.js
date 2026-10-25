import './style.css';
import { zipSync } from 'fflate';
import { language, t, applyTranslations, setLanguage } from './i18n.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  dropZone: $('#dropZone'), fileInput: $('#fileInput'), chooseBtn: $('#chooseBtn'),
  effort: $('#effortSelect'), results: $('#results'), fileList: $('#fileList'),
  fileCount: $('#fileCount'), statCount: $('#statCount'), statBefore: $('#statBefore'),
  statAfter: $('#statAfter'), statSaved: $('#statSaved'),
  progressBlock: $('#progressBlock'), progressLabel: $('#progressLabel'),
  progressPercent: $('#progressPercent'), progressFill: $('#progressFill'),
  clearBtn: $('#clearBtn'), downloadAllBtn: $('#downloadAllBtn'), toast: $('#toast'),
  lang: $('#languageSelect'), theme: $('#themeToggle'), themeLabel: $('#themeLabel')
};

const SUPPORTED_EXTENSIONS = new Set([
  'png', 'apng', 'jpg', 'jpeg', 'jfif', 'webp', 'avif', 'gif', 'svg',
  'bmp', 'tif', 'tiff', 'heic', 'heif', 'jxl', 'ico', 'qoi', 'psd',
  'raw', 'dng', 'cr2', 'nef', 'arw', 'jp2', 'j2k', 'tga', 'exr', 'hdr'
]);
const entries = [];
let worker;
let sequence = 0;
let batchToken = 0;
let toastTimer;
const pending = new Map();

function createWorker() {
  worker = new Worker(new URL('./optimizer.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id);
    if (data.success) item.resolve(new Uint8Array(data.bytes));
    else item.reject(new Error(data.error));
  };
  worker.onerror = () => {
    for (const item of pending.values()) item.reject(new Error(t('workerError')));
    pending.clear();
    worker.terminate();
    worker = null;
  };
}

function optimizeInWorker(bytes, kind, level) {
  if (!worker) createWorker();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, kind, bytes, level }, [bytes]);
  });
}

function formatBytes(num) {
  if (num < 1024) return `${num} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = num;
  let index = -1;
  do { value /= 1024; index += 1; } while (value >= 1024 && index < units.length - 1);
  return `${value.toLocaleString(language() === 'en' ? 'en-US' : 'id-ID', { maximumFractionDigits: value < 10 ? 2 : 1 })} ${units[index]}`;
}

function extOf(fileName) { return fileName.split('.').pop()?.toLowerCase() || ''; }
function fileKind(file) {
  const ext = extOf(file.name);
  if (ext === 'png' || ext === 'apng') return 'png';
  if (ext === 'svg') return 'svg';
  return 'original';
}
function isImageFile(file) {
  return file.type.startsWith('image/') || SUPPORTED_EXTENSIONS.has(extOf(file.name));
}
function notify(message) {
  els.toast.textContent = message;
  els.toast.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('shown'), 4000);
}

const escapeText = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function addFiles(files) {
  const images = Array.from(files).filter((file) => isImageFile(file) && file.size > 0);
  const excluded = Array.from(files).length - images.length;
  if (excluded) notify(t('excluded', { count: excluded }));
  if (!images.length) return;

  for (const file of images) {
    entries.push({
      id: ++sequence,
      file,
      extension: extOf(file.name),
      kind: fileKind(file),
      status: 'waiting',
      output: file,
      previewUrl: file.type.startsWith('image/') || ['png','jpg','jpeg','gif','webp','svg','avif','bmp','ico'].includes(extOf(file.name))
        ? URL.createObjectURL(file) : null,
      error: null
    });
  }
  els.results.hidden = false;
  renderAll();
  runQueue();
}

let busy = false;
async function runQueue() {
  if (busy) return;
  busy = true;
  const runToken = batchToken;
  try {
    while (true) {
      const entry = entries.find((item) => item.status === 'waiting');
      if (!entry || runToken !== batchToken) break;
      entry.status = 'processing';
      renderAll();
      try {
        if (entry.kind === 'original') {
          entry.status = 'unsupported';
        } else {
          const inputBytes = await entry.file.arrayBuffer();
          if (runToken !== batchToken) break;
          const optimized = await optimizeInWorker(inputBytes, entry.kind, Number(els.effort.value));
          if (runToken !== batchToken) break;
          // Always choose the smaller candidate, never inflate a file.
          if (optimized.byteLength < entry.file.size) {
            const mime = entry.kind === 'svg' ? 'image/svg+xml' : 'image/png';
            entry.output = new Blob([optimized], { type: mime });
            entry.status = 'saved';
          } else {
            entry.status = 'unchanged';
          }
        }
      } catch (error) {
        if (runToken !== batchToken) break;
        entry.status = 'error';
        entry.error = error.message;
      }
      renderAll();
      // Hand control back to browser, especially for large batches.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    busy = false;
    renderAll();
    // Allow additions during an existing batch to be processed too.
    if (entries.some((entry) => entry.status === 'waiting')) runQueue();
  }
}

function fileStatus(entry) {
  switch (entry.status) {
    case 'waiting': return [t('waiting'), 'neutral'];
    case 'processing': return [t('processing'), 'processing'];
    case 'saved': return [t('optimized'), 'success'];
    case 'unchanged': return [t('unchanged'), 'neutral'];
    case 'unsupported': return [t('original'), 'neutral'];
    case 'error': return [t('failed'), 'warning'];
    default: return ['—', 'neutral'];
  }
}

function renderFiles() {
  els.fileList.innerHTML = entries.map((entry) => {
    const [statusLabel, statusClass] = fileStatus(entry);
    const saved = Math.max(0, entry.file.size - entry.output.size);
    const percent = entry.file.size ? 100 * saved / entry.file.size : 0;
    const readableKind = escapeText((entry.extension || 'IMG').toUpperCase().slice(0, 6));
    const preview = entry.previewUrl
      ? `<img src="${entry.previewUrl}" alt="" loading="lazy" />`
      : `<span class="preview-fallback">${readableKind}</span>`;
    return `<div class="file-row" data-id="${entry.id}">
      <div class="file-preview">${preview}</div>
      <div class="file-data"><div class="file-title" title="${escapeText(entry.file.name)}">${escapeText(entry.file.name)}</div>
      <div class="file-meta"><span class="file-ext">${readableKind}</span><span>${formatBytes(entry.file.size)} <span class="right-arrow">→</span> ${formatBytes(entry.output.size)}</span></div></div>
      <div class="file-outcome"><span class="file-status ${statusClass}"><span class="status-indicator"></span>${statusLabel}</span>
      ${saved ? `<span class="file-saved">−${percent.toFixed(1)}% · ${t('saved', { value: formatBytes(saved) })}</span>` : (entry.status === 'unsupported' ? `<span class="file-note">${t('notOptimizable')}</span>` : '')}</div>
      <button class="file-download" data-download="${entry.id}" ${['waiting', 'processing'].includes(entry.status) ? 'disabled' : ''} title="${t('downloading', { name: escapeText(entry.file.name) })}" aria-label="${t('downloading', { name: escapeText(entry.file.name) })}"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v4h16v-4"/></svg></button>
    </div>`;
  }).join('');
}

function renderAll() {
  els.results.hidden = entries.length === 0;
  const count = entries.length;
  const original = entries.reduce((sum, entry) => sum + entry.file.size, 0);
  const current = entries.reduce((sum, entry) => sum + entry.output.size, 0);
  const completed = entries.filter((entry) => !['waiting', 'processing'].includes(entry.status)).length;
  const isProcessing = count > 0 && completed < count;
  els.fileCount.textContent = `(${count})`;
  els.statCount.textContent = count.toLocaleString(language() === 'en' ? 'en-US' : 'id-ID');
  els.statBefore.textContent = formatBytes(original);
  els.statAfter.textContent = formatBytes(current);
  els.statSaved.textContent = formatBytes(original - current);
  els.progressBlock.hidden = !isProcessing;
  els.progressLabel.textContent = t('processingProgress', { done: completed, total: count });
  const progress = count ? Math.round(100 * completed / count) : 0;
  els.progressPercent.textContent = `${progress}%`;
  els.progressFill.style.width = `${progress}%`;
  els.downloadAllBtn.disabled = isProcessing || !count;
  renderFiles();
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function downloadOne(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry || ['waiting', 'processing'].includes(entry.status)) return;
  triggerDownload(entry.output, entry.file.name);
}

async function downloadAll() {
  if (els.downloadAllBtn.disabled) return;
  const button = els.downloadAllBtn;
  const previous = button.innerHTML;
  button.disabled = true;
  button.textContent = t('zipping');
  try {
    const archive = {};
    const used = new Set();
    for (const entry of entries) {
      let name = entry.file.name.replace(/[\\/\x00-\x1f]/g, '_') || 'gambar';
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let count = 1;
      while (used.has(name.toLowerCase())) { name = `${stem} (${count++})${ext}`; }
      used.add(name.toLowerCase());
      archive[name] = [new Uint8Array(await entry.output.arrayBuffer()), { level: 0 }];
    }
    const zipped = zipSync(archive, { level: 0 });
    triggerDownload(new Blob([zipped], { type: 'application/zip' }), 'MoPixel-lossless-images.zip');
    notify(t('zipSuccess'));
  } catch (error) {
    notify(t('zipFailed', { error: error.message }));
  } finally {
    button.innerHTML = previous;
    renderAll();
  }
}

function clearAll() {
  batchToken++;
  if (worker) worker.terminate();
  worker = null;
  for (const callback of pending.values()) callback.reject(new Error(t('cancelled')));
  pending.clear();
  for (const entry of entries) { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); }
  entries.length = 0;
  els.fileInput.value = '';
  renderAll();
}

els.chooseBtn.addEventListener('click', (event) => { event.stopPropagation(); els.fileInput.click(); });
els.dropZone.addEventListener('click', () => els.fileInput.click());
els.dropZone.addEventListener('keydown', (event) => {
  if (event.target === els.dropZone && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); els.fileInput.click();
  }
});
els.fileInput.addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
for (const type of ['dragenter', 'dragover']) els.dropZone.addEventListener(type, (event) => {
  event.preventDefault(); els.dropZone.classList.add('dragging');
});
for (const type of ['dragleave', 'drop']) els.dropZone.addEventListener(type, (event) => {
  event.preventDefault(); els.dropZone.classList.remove('dragging');
});
els.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
els.fileList.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-download]');
  if (btn) downloadOne(Number(btn.dataset.download));
});
els.clearBtn.addEventListener('click', clearAll);
els.downloadAllBtn.addEventListener('click', downloadAll);
// Files dragged anywhere in the page should not accidentally navigate away.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
renderAll();


// User preferences: English and Light are defaults on a fresh browser.
// Reuse previous explicit choices when available, without system-theme auto-switching.
let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function updateTheme() {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === 'dark';
  const tooltip = t(isDark ? 'switchToLight' : 'switchToDark');
  els.theme.setAttribute('aria-label', tooltip);
  els.theme.title = tooltip;
  els.theme.setAttribute('aria-pressed', String(isDark));
  els.themeLabel.textContent = t(isDark ? 'themeDark' : 'themeLight');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#15192a' : '#f6f8fc');
}
els.lang.addEventListener('change', (event) => {
  setLanguage(event.target.value);
  updateTheme();
  renderAll(); // Rerender progress, file statuses, filenames, and byte locales.
});
els.theme.addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('mopixel-theme', theme); } catch {}
  updateTheme();
});
applyTranslations();
updateTheme();
renderAll();
