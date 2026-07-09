import os
import subprocess
import sys
from pathlib import Path

try:
    from huggingface_hub import HfApi
except ImportError:
    print("ERROR: huggingface_hub not installed. Run: pip install huggingface_hub")
    sys.exit(1)


REPO_ROOT = Path(__file__).parent.resolve()
GITHUB_REPO = "https://github.com/yummyfiles/Project-Bob.git"
HF_REPO_ID = "yummyfiles/Bob"
COMMIT_MSG = "feat: deploy high-contrast stark UI"


def run_cmd(cmd: str, cwd: Path = None) -> subprocess.CompletedProcess:
    print(f"> {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd or REPO_ROOT, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr:
        print(result.stderr.strip(), file=sys.stderr)
    if result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
    return result


def deploy_github():
    print("\n=== GITHUB DEPLOYMENT ===")
    if not (REPO_ROOT / ".git").exists():
        run_cmd("git init")
    run_cmd("git checkout -B main")
    run_cmd('git config user.email "project-bob@local"')
    run_cmd('git config user.name "Project Bob"')
    result = subprocess.run("git remote get-url origin", shell=True, cwd=REPO_ROOT, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        run_cmd(f"git remote add origin {GITHUB_REPO}")
    else:
        run_cmd(f"git remote set-url origin {GITHUB_REPO}")
    run_cmd("git add index.html app.js dataset.jsonl colab_training_notebook.py push_assets.py")
    run_cmd(f'git commit -m "{COMMIT_MSG}"')
    try:
        run_cmd("git push --force origin main")
        print("GitHub deployment complete.")
    except subprocess.CalledProcessError as e:
        if "Repository not found" in str(e.stderr):
            print("\nERROR: GitHub repository 'yummyfiles/Project-Bob' not found.")
            print("Create it first at: https://github.com/new")
            print("Repository name: Project-Bob")
            print("Owner: yummyfiles")
        raise


def upload_huggingface():
    print("\n=== HUGGING FACE UPLOAD ===")
    try:
        api = HfApi()
        api.upload_folder(
            folder_path=str(REPO_ROOT),
            repo_id=HF_REPO_ID,
            repo_type="model",
            ignore_patterns=[".git", "__pycache__", "*.pyc"],
        )
        print(f"Uploaded to https://huggingface.co/{HF_REPO_ID}")
    except Exception as e:
        if "401" in str(e) or "unauthorized" in str(e).lower() or "token" in str(e).lower():
            print("ERROR: Please run 'huggingface-cli login' in your terminal and paste your Hugging Face write-access token before running this script again.")
        else:
            print(f"Upload failed: {e}")
        sys.exit(1)


def main():
    deploy_github()
    upload_huggingface()
    print("\nAll assets deployed successfully.")


if __name__ == "__main__":
    main()