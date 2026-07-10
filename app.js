import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

const MODEL_ID = 'Xenova/tinyllama-1.1b-chat-v1.0';

const inputEl = document.getElementById('input');
const chatEl = document.getElementById('chat');
const executeBtn = document.getElementById('execute');
const statusEl = document.getElementById('status');
const chatListEl = document.getElementById('chat-list');
const newChatBtn = document.getElementById('new-chat-btn');
const chatTitleEl = document.getElementById('chat-title');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const menuBtn = document.getElementById('menu-btn');

let generator = null;
let isLoading = false;
let currentChatId = null;
let chats = JSON.parse(localStorage.getItem('bob_chats') || '{}');

const customTools = {
  get_crypto_price: async (symbol) => {
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`);
      const data = await response.json();
      if (data[symbol.toLowerCase()]) return `$${data[symbol.toLowerCase()].usd.toLocaleString()}`;
      return `Price unavailable for ${symbol}`;
    } catch { return `Error fetching price for ${symbol}`; }
  },
  multiply_numbers: (a, b) => a * b
};

function saveChats() { localStorage.setItem('bob_chats', JSON.stringify(chats)); }

function createChat() {
  const id = Date.now().toString();
  chats[id] = { id, title: 'New Chat', messages: [], created: Date.now(), updated: Date.now() };
  saveChats();
  return id;
}

function deleteChat(id) { delete chats[id]; saveChats(); renderChatList(); }

function switchChat(id) {
  currentChatId = id;
  renderChatList();
  renderChat();
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
}

function updateChatTitle(id, title) {
  if (chats[id]) { chats[id].title = title; chats[id].updated = Date.now(); saveChats(); renderChatList(); }
}

function renderChatList() {
  const sorted = Object.values(chats).sort((a, b) => b.updated - a.updated);
  if (sorted.length === 0) {
    chatListEl.innerHTML = '<div class="empty-chats">No chats yet.<br>Click "NEW CHAT" to start.</div>';
    return;
  }
  chatListEl.innerHTML = sorted.map(c => `
    <div class="chat-item ${c.id === currentChatId ? 'active' : ''}" data-id="${c.id}">
      <div class="chat-item-title">${escapeHtml(c.title)}</div>
      <div class="chat-item-preview">${escapeHtml(c.messages[0]?.content?.slice(0, 40) || '')}</div>
      <div class="chat-item-time">${new Date(c.updated).toLocaleString()}</div>
    </div>
  `).join('');
  chatListEl.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', () => switchChat(el.dataset.id));
  });
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'"',"'":'''}[c])); }

function renderChat() {
  if (!currentChatId || !chats[currentChatId]) { showWelcome(); return; }
  const chat = chats[currentChatId];
  chatTitleEl.textContent = chat.title;
  chatEl.innerHTML = '';
  if (chat.messages.length === 0) { showWelcome(); return; }
  chat.messages.forEach(msg => appendMessage(msg.role, msg.content, false));
  chatEl.scrollTop = chatEl.scrollHeight;
}

function showWelcome() {
  chatTitleEl.textContent = currentChatId ? chats[currentChatId]?.title || 'New Chat' : 'Select a chat or start new';
  chatEl.innerHTML = `
    <div class="welcome">
      <h2>BOB</h2>
      <p>Local-first AI running 100% in your browser via WebAssembly.<br>No servers. No cloud. No tracking.</p>
      <div class="hint">Ctrl+Enter to send · Try "What's Bitcoin price?" or "Multiply 144 by 37"</div>
    </div>
  `;
}

function appendMessage(role, content, save = true) {
  if (chatEl.querySelector('.welcome')) chatEl.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'YOU' : 'BOB';
  wrapper.appendChild(label);
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;
  wrapper.appendChild(contentDiv);
  chatEl.appendChild(wrapper);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (save && currentChatId && chats[currentChatId]) {
    chats[currentChatId].messages.push({ role, content, time: Date.now() });
    chats[currentChatId].updated = Date.now();
    if (chats[currentChatId].messages.length === 1) {
      chats[currentChatId].title = content.slice(0, 40);
    }
    saveChats();
    renderChatList();
  }
}

function appendToolResult(toolName, result) {
  const div = document.createElement('div');
  div.className = 'message tool-result';
  div.textContent = `[TOOL: ${toolName} => ${result}]`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function initModel() {
  if (generator) return generator;
  isLoading = true;
  executeBtn.disabled = true;
  executeBtn.textContent = 'LOADING...';
  statusEl.textContent = `Loading ${MODEL_ID}... (first run downloads ~600MB)`;

  try {
    generator = await pipeline('text-generation', MODEL_ID, {
      dtype: 'q4',
      progress_callback: (progress) => {
        if (progress.status === 'downloading') {
          const mb = (progress.loaded / 1024 / 1024).toFixed(1);
          const totalMb = (progress.total / 1024 / 1024).toFixed(1);
          statusEl.textContent = `Downloading: ${mb} / ${totalMb} MB`;
        } else if (progress.status === 'progress') {
          statusEl.textContent = `Initializing: ${Math.round(progress.progress * 100)}%`;
        }
      }
    });
    statusEl.textContent = 'Ready. Model loaded locally.';
  } catch (err) { statusEl.textContent = `Error: ${err.message}`; console.error(err); }
  finally { isLoading = false; executeBtn.disabled = false; executeBtn.textContent = 'SEND'; }
  return generator;
}

function formatPrompt(userInput, history = []) {
  let prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are Bob, a local AI assistant running in the browser. You have access to tools. When you need to use a tool, respond with EXACTLY this format:
<call_tool>function_name({"arg": "value"})</call_tool>

Available tools:
- get_crypto_price: Get crypto price. Args: {"symbol": "BTC"}
- multiply_numbers: Multiply two numbers. Args: {"a": 5, "b": 10}

Only call tools when needed. Respond normally for regular questions.
<|eot_id|>`;

  for (const msg of history.slice(-6)) {
    prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n${msg.content}<|eot_id|>`;
  }
  prompt += `<|start_header_id|>user<|end_header_id|>\n${userInput}<|eot_id|>\n<|start_header_id|>assistant<|end_header_id|>\n`;
  return prompt;
}

async function executeToolCalls(text) {
  const toolCallRegex = /<call_tool>(\w+)\((\{.*?\})\)<\/call_tool>/g;
  let result = text;
  let match;
  while ((match = toolCallRegex.exec(text)) !== null) {
    const funcName = match[1];
    let args;
    try { args = JSON.parse(match[2]); } catch { continue; }
    if (customTools[funcName]) {
      try {
        const toolResult = await customTools[funcName](...Object.values(args));
        result = result.replace(match[0], `[TOOL RESULT: ${funcName} => ${toolResult}]`);
        appendToolResult(funcName, toolResult);
      } catch (err) { result = result.replace(match[0], `[TOOL ERROR: ${err.message}]`); }
    }
  }
  return result;
}

async function runInference(prompt, history) {
  if (!generator) await initModel();
  if (!generator) return 'Model not loaded.';

  const formatted = formatPrompt(prompt, history);
  statusEl.textContent = 'Processing locally...';

  try {
    const output = await generator(formatted, {
      max_new_tokens: 256, temperature: 0.1, top_p: 0.9,
      do_sample: true, return_full_text: false, repetition_penalty: 1.2
    });
    let generated = output[0].generated_text.trim();
    generated = generated
      .replace(/^.*?<\|assistant\|>\s*/s, '')
      .replace(/^.*?<\|user\|>\s*/s, '')
      .replace(/^.*?<\|system\|>\s*/s, '')
      .replace(/^.*?You are Bob.*?\n/s, '')
      .replace(/Available tools:[\s\S]*?Only call tools[\s\S]*?\n/, '')
      .trim();

    const toolCallRegex = /<call_tool>(\w+)\((\{.*?\})\)<\/call_tool>/g;
    let match;
    while ((match = toolCallRegex.exec(generated)) !== null) {
      const funcName = match[1];
      let args;
      try { args = JSON.parse(match[2]); } catch { continue; }
      if (customTools[funcName]) {
        try {
          const toolResult = await customTools[funcName](...Object.values(args));
          generated = generated.replace(match[0], `[TOOL RESULT: ${funcName} => ${toolResult}]`);
        } catch (err) { generated = generated.replace(match[0], `[TOOL ERROR: ${err.message}]`); }
      }
    }
    return generated.trim();
  } catch (err) { console.error(err); return `Error: ${err.message}`; }
}

async function handleSend() {
  if (isLoading) return;
  const prompt = inputEl.value.trim();
  if (!prompt) return;

  if (!currentChatId) currentChatId = createChat();
  appendMessage('user', prompt);
  inputEl.value = '';

  executeBtn.disabled = true;
  executeBtn.textContent = 'THINKING...';

  const history = chats[currentChatId]?.messages.slice(-6) || [];
  const result = await runInference(prompt, history);
  appendMessage('assistant', result);

  executeBtn.disabled = false;
  executeBtn.textContent = 'SEND';
  statusEl.textContent = 'Ready.';
}

executeBtn.addEventListener('click', handleSend);
inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); });

newChatBtn.addEventListener('click', () => { currentChatId = createChat(); switchChat(currentChatId); inputEl.focus(); });

menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); sidebarOverlay.classList.toggle('open'); });
sidebarOverlay.addEventListener('click', () => { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); });

renderChatList();
if (Object.keys(chats).length > 0) {
  const latest = Object.values(chats).sort((a,b)=>b.updated-a.updated)[0];
  switchChat(latest.id);
}
initModel();