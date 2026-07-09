import os
import subprocess
import sys

def run_cmd(cmd, cwd=None):
    print(f"$ {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}")
    return result

def main():
    os.makedirs("/content/project_bob", exist_ok=True)
    os.chdir("/content/project_bob")

    run_cmd("pip install -q -U autotrain-advanced huggingface_hub huggingface_hub[cli] optimum transformers accelerate peft bitsandbytes datasets")

    with open("dataset.jsonl", "w") as f:
        f.write("""{"text": "<|begin_of_text|><|start_header_id|>user<|end_header_id|>What is the current price of Bitcoin?<|eot_id|><|start_header_id|>assistant<|end_header_id|><call_tool>get_crypto_price({\\"symbol\\": \\"BTC\\"})</call_tool><|eot_id|>"}
{"text": "<|begin_of_text|><|start_header_id|>user<|end_header_id|>Multiply 42 by 58 for me.<|eot_id|><|start_header_id|>assistant<|end_header_id|><call_tool>multiply_numbers({\\"a\\": 42, \\"b\\": 58})</call_tool><|eot_id|>"}
{"text": "<|begin_of_text|><|start_header_id|>user<|end_header_id|>What is the capital of France?<|eot_id|><|start_header_id|>assistant<|end_header_id|>The capital of France is Paris.<|eot_id|>"}
{"text": "<|begin_of_text|><|start_header_id|>user<|end_header_id|>Calculate 144 multiplied by 37.<|eot_id|><|start_header_id|>assistant<|end_header_id|><call_tool>multiply_numbers({\\"a\\": 144, \\"b\\": 37})</call_tool><|eot_id|>"}
{"text": "<|begin_of_text|><|start_header_id|>user<|end_header_id|>What's the current Ethereum price?<|eot_id|><|start_header_id|>assistant<|end_header_id|><call_tool>get_crypto_price({\\"symbol\\": \\"ETH\\"})</call_tool><|eot_id|>"}
""")

    print("Uploading dataset.jsonl to Hugging Face Hub...")
    from huggingface_hub import HfApi, HfFolder
    api = HfApi()
    api.upload_file(
        path_or_fileobj="dataset.jsonl",
        path_in_repo="dataset.jsonl",
        repo_id="yummyfiles/Bob",
        repo_type="dataset",
        token=os.getenv("HF_TOKEN"),
    )
    print("Dataset uploaded to yummyfiles/Bob")

    print("Starting AutoTrain QLoRA fine-tuning...")
    autotrain_cmd = (
        "autotrain llm --train "
        "--project-name Bob "
        "--model meta-llama/Llama-3.2-1B-Instruct "
        "--train-data yummyfiles/Bob "
        "--data-path dataset.jsonl "
        "--text-column text "
        "--trainer peft "
        "--peft-r 16 "
        "--peft-alpha 32 "
        "--peft-dropout 0.05 "
        "--learning-rate 2e-4 "
        "--batch-size 1 "
        "--epochs 3 "
        "--block-size 2048 "
        "--warmup-ratio 0.03 "
        "--optimizer paged_adamw_8bit "
        "--scheduler cosine "
        "--gradient-accumulation 4 "
        "--mixed-precision bf16 "
        "--quantization 4bit "
        "--push-to-hub "
        "--repo-id yummyfiles/Bob "
        f"--token {os.getenv('HF_TOKEN')}"
    )
    run_cmd(autotrain_cmd)

    print("Converting model to ONNX (4-bit)...")
    run_cmd("pip install -q optimum[onnxruntime]")
    run_cmd(
        "optimum-cli export onnx "
        "--model yummyfiles/Bob "
        "--task text-generation "
        "--quantize int4 "
        "--output /content/project_bob/web_model"
    )

    print("Uploading ONNX model to yummyfiles/Bob...")
    api.upload_folder(
        folder_path="/content/project_bob/web_model",
        path_in_repo="web_model",
        repo_id="yummyfiles/Bob",
        repo_type="model",
        token=os.getenv("HF_TOKEN"),
    )

    print("Done! Model and ONNX artifacts uploaded to yummyfiles/Bob")

if __name__ == "__main__":
    main()