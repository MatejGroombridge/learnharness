import { createProvider, type Model, type Provider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

/**
 * A local Ollama provider (local setup, not upstream): Ollama serves an
 * OpenAI-compatible Chat Completions endpoint, so it rides pi-ai's own
 * openai-completions API. Keyless — Ollama ignores the bearer token, but the
 * OpenAI client wants one, so a placeholder resolves when none is set.
 *
 * Env (all optional; names avoid Ollama's own OLLAMA_HOST / OLLAMA_MODELS):
 *   LH_OLLAMA_BASE_URL  default http://localhost:11434/v1
 *   LH_OLLAMA_MODELS    comma-separated tags, default DEFAULT_MODELS below
 *   LH_OLLAMA_CONTEXT   context window the app budgets for, default 32768 —
 *                       keep it in step with the server's OLLAMA_CONTEXT_LENGTH
 *                       (the /v1 endpoint cannot set num_ctx per request).
 */
export const OLLAMA_PROVIDER_ID = "ollama";

const DEFAULT_BASE_URL = "http://localhost:11434/v1";
// gemma4-gpu is a local alias (scripts/Modelfile.gemma-gpu) that pins every
// layer to the GPU — Ollama's default VRAM margin spills 3 layers to CPU:
//   ollama create gemma4-gpu:26b-a4b-it-qat -f scripts/Modelfile.gemma-gpu
const DEFAULT_MODELS = "gemma4-gpu:26b-a4b-it-qat,gemma4:26b-a4b-it-qat,gemma4:12b-it-qat,gpt-oss:20b,ornith-1.5:9b,bonsai-2:27b";
const DEFAULT_CONTEXT = 32768;

/** Per-family thinking + modality. Most local thinkers are on/off only and
 *  Ollama defaults thinking ON, so "off" must be sent explicitly — the
 *  openrouter-style reasoning:{effort} body (which Ollama's /v1 accepts)
 *  does that. gpt-oss cannot turn reasoning off but has three levels. */
function familyProfile(id: string): Pick<Model<"openai-completions">, "thinkingLevelMap" | "input"> {
	if (id.startsWith("gpt-oss")) {
		return {
			thinkingLevelMap: { off: null, minimal: null, low: "low", medium: "medium", high: "high" },
			input: ["text"],
		};
	}
	return {
		thinkingLevelMap: { off: "none", minimal: null, low: null, medium: null, high: "high" },
		input: ["text", "image"],
	};
}

function ollamaModel(id: string, baseUrl: string, contextWindow: number): Model<"openai-completions"> {
	return {
		id,
		name: `${id} (Ollama)`,
		api: "openai-completions",
		provider: OLLAMA_PROVIDER_ID,
		baseUrl,
		reasoning: true,
		...familyProfile(id),
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens: Math.min(16384, contextWindow),
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			maxTokensField: "max_tokens",
			thinkingFormat: "openrouter",
		},
	};
}

export function ollamaProvider(): Provider {
	const baseUrl = process.env.LH_OLLAMA_BASE_URL || DEFAULT_BASE_URL;
	const contextWindow = Number(process.env.LH_OLLAMA_CONTEXT) || DEFAULT_CONTEXT;
	const ids = (process.env.LH_OLLAMA_MODELS || DEFAULT_MODELS)
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	return createProvider({
		id: OLLAMA_PROVIDER_ID,
		name: "Ollama (local)",
		baseUrl,
		auth: {
			apiKey: {
				name: "Ollama (no key needed)",
				resolve: async () => ({ auth: { apiKey: process.env.OLLAMA_API_KEY || "ollama" }, source: "local" }),
			},
		},
		models: ids.map((id) => ollamaModel(id, baseUrl, contextWindow)),
		api: openAICompletionsApi(),
	});
}
