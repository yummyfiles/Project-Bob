import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

const MODEL_ID = 'Xenova/distilgpt2';

const inputEl = document.getElementById('input');
const outputEl = document.getElementById('output');
const executeBtn = document.getElementById('execute');

let generator = null;
let isLoading = false;

const customTools = {
  get_crypto_price: async (symbol) => {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`);
    const data = await response.json();
    if (data[symbol.toLowerCase()]) {
      return `$${data[symbol.toLowerCase()].usd.toLocaleString()}`;
    }
    return `Price unavailable for ${symbol}`;
  },
  multiply_numbers: (a, b) => a * b
};

async function initModel() {
  if (generator) return generator;
  isLoading = true;
  executeBtn.disabled = true;
  executeBtn.textContent = 'LOADING MODEL...';
  outputEl.textContent = `Loading ${MODEL_ID} into browser... (first run downloads ~120MB)`;

  try {
    generator = await pipeline('text-generation', MODEL_ID, {
      dtype: 'q4',
      progress_callback: (progress) => {
        if (progress.status === 'downloading') {
          const mb = (progress.loaded / 1024 / 1024).toFixed(1);
          const totalMb = (progress.total / 1024 / 1024).toFixed(1);
          outputEl.textContent = `Downloading model: ${mb} / ${totalMb} MB`;
        } else if (progress.status === 'progress') {
          outputEl.textContent = `Initializing: ${Math.round(progress.progress * 100)}%`;
        }
      }
    });
    outputEl.textContent = 'Model loaded. Ready for local inference.';
  } catch (err) {
    outputEl.textContent = `Error loading model: ${err.message}`;
    console.error(err);
  } finally {
    isLoading = false;
    executeBtn.disabled = false;
    executeBtn.textContent = 'EXECUTE CORE';
  }
  return generator;
}

function formatPrompt(userInput) {
  return `<|system|>
You are Bob, a local AI assistant running in the browser. You have access to tools. When you need to use a tool, respond with EXACTLY this format:
<call_tool>function_name({"arg": "value"})</call_tool>

Available tools:
- get_crypto_price: Get crypto price. Args: {"symbol": "BTC"}
- multiply_numbers: Multiply two numbers. Args: {"a": 5, "b": 10}

Only call tools when needed. Respond normally for regular questions.
<|user|>
${userInput}
<|assistant|>
`;
}

async function executeToolCalls(text) {
  // Simple format: <call_tool>function_name({"arg": "val"})</call_tool>
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

async function runInference(prompt) {
  if (!generator) await initModel();
  if (!generator) return 'Model not loaded.';

  const formatted = formatPrompt(prompt);
  outputEl.textContent = 'Processing locally...';

  try {
    const output = await generator(formatted, {
      max_new_tokens: 512,
      temperature: 0.1,
      top_p: 0.9,
      do_sample: true,
      return_full_text: false
    });
    let generated = output[0].generated_text.trim();
    generated = await executeToolCalls(generated);
    return generated;
  } catch (err) {
    console.error(err);
    return `Inference error: ${err.message}`;
  }
}

executeBtn.addEventListener('click', async () => {
  if (isLoading) return;
  const prompt = inputEl.value.trim();
  if (!prompt) return;

  executeBtn.disabled = true;
  executeBtn.textContent = 'PROCESSING...';

  const result = await runInference(prompt);
  outputEl.textContent = result;

  executeBtn.disabled = false;
  executeBtn.textContent = 'EXECUTE CORE';
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    executeBtn.click();
  }
});

initModel();