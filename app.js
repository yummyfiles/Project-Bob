import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

const MODEL_ID = 'Xenova/tinyllama-1.1b-chat-v1.0';

const inputEl = document.getElementById('input');
const chatEl = document.getElementById('chat');
const executeBtn = document.getElementById('execute');
const statusEl = document.getElementById('status');

let generator = null;
let isLoading = false;

const customTools = {
  get_crypto_price: async (symbol) => {
    try {
      const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`);
      const data = await response.json();
      if (data[symbol.toLowerCase()]) {
        return `$${data[symbol.toLowerCase()].usd.toLocaleString()}`;
      }
      return `Price unavailable for ${symbol}`;
    } catch {
      return `Error fetching price for ${symbol}`;
    }
  },
  multiply_numbers: (a, b) => a * b
};

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
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    isLoading = false;
    executeBtn.disabled = false;
    executeBtn.textContent = 'SEND';
  }
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

  for (const msg of history) {
    if (msg.role === 'user') {
      prompt += `<|start_header_id|>user<|end_header_id|>
${msg.content}<|eot_id|>`;
    } else if (msg.role === 'assistant') {
      prompt += `<|start_header_id|>assistant<|end_header_id|>
${msg.content}<|eot_id|>`;
    }
  }

  prompt += `<|start_header_id|>user<|end_header_id|>
${userInput}<|eot_id|>
<|start_header_id|>assistant<|end_header_id|>
`;
  return prompt;
}

async function executeToolCalls(text) {
  const toolCallRegex = /<call_tool>(\w+)\((\{.*?\})\)<\/call_tool>/g;
  let result = text;
  let match;

  while ((match = toolCallRegex.exec(text)) !== null) {
    const funcName = match[1];
    let args;
    try {
      args = JSON.parse(match[2]);
    } catch {
      continue;
    }

    if (customTools[funcName]) {
      try {
        const toolResult = await customTools[funcName](...Object.values(args));
        const resultStr = String(toolResult);
        result = result.replace(match[0], `[TOOL RESULT: ${funcName} => ${resultStr}]`);
      } catch (err) {
        result = result.replace(match[0], `[TOOL ERROR: ${err.message}]`);
      }
    }
  }

  return result;
}

function appendMessage(role, content) {
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
}

function appendToolResult(toolName, result) {
  const div = document.createElement('div');
  div.className = 'message tool-result';
  div.textContent = `[TOOL: ${toolName} => ${result}]`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function runInference(prompt, history) {
  if (!generator) await initModel();
  if (!generator) return 'Model not loaded.';

  const formatted = formatPrompt(prompt, history);
  statusEl.textContent = 'Processing locally...';

  try {
    const output = await generator(formatted, {
      max_new_tokens: 256,
      temperature: 0.1,
      top_p: 0.9,
      do_sample: true,
      return_full_text: false,
      repetition_penalty: 1.2
    });
    let generated = output[0].generated_text.trim();

    // Clean artifacts
    generated = generated
      .replace(/^.*?<\|assistant\|>\s*/s, '')
      .replace(/^.*?<\|user\|>\s*/s, '')
      .replace(/^.*?<\|system\|>\s*/s, '')
      .replace(/^.*?You are Bob.*?\n/s, '')
      .replace(/Available tools:[\s\S]*?Only call tools[\s\S]*?\n/, '')
      .trim();

    // Execute tools
    const toolCallRegex = /<call_tool>(\w+)\((\{.*?\})\)<\/call_tool>/g;
    let match;
    while ((match = toolCallRegex.exec(generated)) !== null) {
      const funcName = match[1];
      let args;
      try {
        args = JSON.parse(match[2]);
      } catch {
        continue;
      }
      if (customTools[funcName]) {
        try {
          const toolResult = await customTools[funcName](...Object.values(args));
          generated = generated.replace(match[0], `[TOOL RESULT: ${funcName} => ${toolResult}]`);
          appendToolResult(funcName, toolResult);
        } catch (err) {
          generated = generated.replace(match[0], `[TOOL ERROR: ${err.message}]`);
        }
      }
    }

    return generated.trim();
  } catch (err) {
    console.error(err);
    return `Error: ${err.message}`;
  }
}

executeBtn.addEventListener('click', async () => {
  if (isLoading) return;
  const prompt = inputEl.value.trim();
  if (!prompt) return;

  appendMessage('user', prompt);
  inputEl.value = '';

  executeBtn.disabled = true;
  executeBtn.textContent = 'THINKING...';

  // Build history from chat (last 6 messages)
  const messages = chatEl.querySelectorAll('.message:not(.tool-result)');
  const history = [];
  for (let i = Math.max(0, messages.length - 6); i < messages.length; i++) {
    const msg = messages[i];
    const role = msg.classList.contains('user') ? 'user' : 'assistant';
    const content = msg.querySelector('.message-content').textContent;
    history.push({ role, content });
  }

  const result = await runInference(prompt, history);
  appendMessage('assistant', result);

  executeBtn.disabled = false;
  executeBtn.textContent = 'SEND';
  statusEl.textContent = 'Ready.';
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    executeBtn.click();
  }
});

initModel();