const fs = require("fs");
const path = require("path");

const CATEGORIES = [
  "deepseek",
  "google",
  "meta-llama",
  "anthropic",
  "openai",
  "x-ai",
  "mistralai",
  "perplexity",
  "qwen",
  "moonshotai",
  "z-ai",
  "minimax",
  "aion-labs",
  "intfloat",
  "xiaomi",
  "tencent",
];

function categorizeModel(modelId) {
  for (const prefix of CATEGORIES) {
    if (modelId.startsWith(prefix + "/")) {
      return prefix;
    }
  }
  return "other";
}

async function main() {
  const outputPath = path.join(process.cwd(), "src", "data", "liara-ai-models.json");
  try {
    const res = await fetch("https://ai.liara.ir/v1/models", {
      headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) throw new Error(`Model API returned HTTP ${res.status}`);
    const data = await res.json();

    const categorized = {};

    [...CATEGORIES, "other"].forEach((key) => {
      categorized[key] = [];
    });

    data.models.forEach((m) => {
      const category = categorizeModel(m.id);
      categorized[category].push(m.id);
    });

    const dirPath = path.join(process.cwd(), "src", "data");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(categorized, null, 2));

    console.log("liara-ai-models.json generated successfully!");
  } catch (error) {
    if (fs.existsSync(outputPath)) {
      console.warn("Model API unavailable; using the committed model snapshot.");
      return;
    }
    console.error("Model API unavailable and no committed snapshot exists:", error);
    process.exitCode = 1;
  }
}

main();
