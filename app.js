import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

const MODEL_ID = 'yummyfiles/Bob';

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
You are Bob, a local-first AI assistant running entirely in the user's browser via WebAssembly. No cloud, no tracking, no servers. You are concise, direct, and helpful. You can call tools using <call_tool> tags with format: <call_tool>function_name({arg1: "val", arg2: 123})</call_tool>
<|user|>
${userInput}
<|assistant|>
`;
}

async function executeToolCalls(text) {
  const toolCallRegex = /<call_tool>(.*?)<\/call_tool>/g;
  let result = text;
  let match;

  while ((match = toolCallRegex.exec(text)) !== null) {
    const callContent = match[1].trim();
    const funcMatch = callContent.match(/^(\w+)\((.*)\)$/);
    if (!funcMatch) continue;

    const funcName = funcMatch[1];
    const argsStr = funcMatch[2];

    try {
      let args = {};
      if (argsStr.trim()) {
        const argPairs = argsStr.split(',').map(s => s.trim());
        for (const pair of argPairs) {
          const [key, val] = pair.split(':').map(s => s.trim());
          if (key && val) {
            let parsed = val;
            if (val.startsWith('"') && val.endsWith('"')) parsed = val.slice(1, -1);
            else if (!isNaN(val)) parsed = Number(val);
            else if (val === 'true') parsed = true;
            else if (val === 'false') parsed = false;
            args[key] = parsed;
          }
        }
      }

      if (customTools[funcName]) {
        const toolResult = await customTools[funcName](...Object.values(args));
        const resultStr = String(toolResult);
        result = result.replace(match[0], `[TOOL RESULT: ${funcName} => ${resultStr}]`);
      }
    } catch (err) {
      result = result.replace(match[0], `[TOOL ERROR: ${err.message}]`);
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
      max_new_tokens: 256,
      temperature: 0.7,
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