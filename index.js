const HOSTED_API_BASE_URL = "https://claw-temp.nydhfc.cn";
const STORAGE_KEY = "openclaw-temperature-api-key";
const SKILL_VERSION = "openclaw-temperature.skill.v1";

const DEFAULT_EVENT_MAP = {
  task_success: "celebration",
  task_blocked: "encouragement",
  user_frustration: "empathy",
  user_delight: "playful"
};

function makeEventId() {
  if (globalThis.crypto?.randomUUID) {
    return `evt_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  }

  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length <= 10) {
    return "********";
  }

  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}

async function getNodeStorageFilePath() {
  if (!globalThis.process?.versions?.node) {
    return null;
  }

  const path = await import("node:path");
  return process.env.OPENCLAW_TEMPERATURE_KEY_FILE
    ?? path.join(process.cwd(), ".openclaw-temperature", "api-key.json");
}

export function createDefaultApiKeyStorage({ storageKey = STORAGE_KEY } = {}) {
  return {
    async getItem() {
      if (globalThis.localStorage) {
        return globalThis.localStorage.getItem(storageKey);
      }

      const filePath = await getNodeStorageFilePath();
      if (!filePath) {
        return null;
      }

      try {
        const fs = await import("node:fs/promises");
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return typeof parsed.apiKey === "string" ? parsed.apiKey : null;
      } catch {
        return null;
      }
    },

    async setItem(apiKey) {
      if (globalThis.localStorage) {
        globalThis.localStorage.setItem(storageKey, apiKey);
        return;
      }

      const filePath = await getNodeStorageFilePath();
      if (!filePath) {
        return;
      }

      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(
        filePath,
        JSON.stringify({ apiKey, createdAt: new Date().toISOString() }, null, 2),
        "utf8"
      );
    }
  };
}

export function buildReactionEvent({
  eventType,
  emotionalFamily,
  intensity = "low",
  confidence = 0.8,
  metadata = {}
}) {
  return {
    schema_version: "reaction-event.v1",
    event: {
      event_id: makeEventId(),
      event_type: eventType,
      emotional_family: emotionalFamily ?? DEFAULT_EVENT_MAP[eventType],
      intensity,
      timestamp: new Date().toISOString(),
      source_context: {
        surface: "chat_reply",
        trigger_moment: "after_main_reply",
        confidence
      },
      metadata
    }
  };
}

export async function registerApiKey({
  hostedApiBaseUrl = HOSTED_API_BASE_URL,
  fetchImpl = fetch
} = {}) {
  const response = await fetchImpl(`${hostedApiBaseUrl}/v1/public/api-keys/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      source: "openclaw_skill_library"
    })
  });

  if (!response.ok) {
    throw new Error(`register_http_${response.status}`);
  }

  const body = await response.json();
  const registration = body.api_key_registration;
  const apiKey = registration?.apiKey?.token;
  if (!apiKey) {
    throw new Error("register_missing_api_key");
  }

  return {
    apiKey,
    registration
  };
}

export async function ensureApiKey({
  hostedApiBaseUrl = HOSTED_API_BASE_URL,
  apiKey,
  storage = createDefaultApiKeyStorage(),
  fetchImpl = fetch
} = {}) {
  if (apiKey) {
    return {
      apiKey,
      registration: null,
      source: "provided"
    };
  }

  const storedApiKey = await storage.getItem();
  if (storedApiKey) {
    return {
      apiKey: storedApiKey,
      registration: null,
      source: "stored"
    };
  }

  const registered = await registerApiKey({ hostedApiBaseUrl, fetchImpl });
  await storage.setItem(registered.apiKey);
  return {
    ...registered,
    source: "registered"
  };
}

export async function initializeTemperatureLayer({
  hostedApiBaseUrl = HOSTED_API_BASE_URL,
  apiKey = null,
  storage = createDefaultApiKeyStorage(),
  fetchImpl = fetch
} = {}) {
  const resolved = await ensureApiKey({
    hostedApiBaseUrl,
    apiKey,
    storage,
    fetchImpl
  });

  return {
    status: resolved.registration?.status ?? "ready",
    apiKeyHint: maskApiKey(resolved.apiKey),
    source: resolved.source,
    trialExpiresAt: resolved.registration?.trial_expires_at ?? null,
    rechargeUrl: resolved.registration?.recharge_url ?? `${hostedApiBaseUrl}/buy`,
    message:
      resolved.source === "registered"
        ? "OpenClaw 温度层已开启 1 个月免费试用。"
        : "OpenClaw 温度层已就绪。"
  };
}

export async function requestReaction({
  hostedApiBaseUrl = HOSTED_API_BASE_URL,
  apiKey = null,
  payload,
  storage = createDefaultApiKeyStorage(),
  fetchImpl = fetch
}) {
  try {
    const resolved = await ensureApiKey({
      hostedApiBaseUrl,
      apiKey,
      storage,
      fetchImpl
    });

    const response = await fetchImpl(`${hostedApiBaseUrl}/v1/reactions/decide`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${resolved.apiKey}`,
        "content-type": "application/json",
        "x-openclaw-skill-version": SKILL_VERSION
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      if (response.status === 402 || errorBody.code === "recharge_required") {
        return {
          mode: "recharge_required",
          degraded: false,
          apiKeyHint: maskApiKey(resolved.apiKey),
          reason: "trial_expired",
          rechargeUrl: errorBody.recharge_url ?? `${hostedApiBaseUrl}/buy`
        };
      }

      return {
        mode: "no_reaction",
        degraded: true,
        reason: `http_${response.status}`
      };
    }

    const body = await response.json();
    if (body.decision?.status !== "reacted" || !body.reaction) {
      return {
        mode: "no_reaction",
        degraded: false,
        apiKeyHint: maskApiKey(resolved.apiKey),
        reason: body.decision?.reason_codes ?? []
      };
    }

    return {
      mode: "react",
      degraded: false,
      apiKeyHint: maskApiKey(resolved.apiKey),
      reaction: body.reaction,
      decision: body.decision
    };
  } catch {
    return {
      mode: "no_reaction",
      degraded: true,
      reason: "network_error"
    };
  }
}

export function attachReactionAfterReply({ mainReply, reactionResult }) {
  if (!reactionResult || reactionResult.mode !== "react") {
    return {
      mainReply,
      reaction: null
    };
  }

  return {
    mainReply,
    reaction: {
      displayMode: "after_main_reply",
      caption: reactionResult.reaction.caption,
      assetUrl: reactionResult.reaction.asset_url
    }
  };
}

export function formatReactionMarkdown(reactionResult) {
  if (!reactionResult || reactionResult.mode === "no_reaction") {
    return "";
  }

  if (reactionResult.mode === "recharge_required") {
    return `OpenClaw 温度层试用已到期，请续期后继续使用：${reactionResult.rechargeUrl}`;
  }

  if (reactionResult.mode !== "react" || !reactionResult.reaction) {
    return "";
  }

  const caption = reactionResult.reaction.caption || "OpenClaw 温度层";
  return `${caption}\n\n![${caption}](${reactionResult.reaction.asset_url})`;
}

export async function createTemperatureGifReply({
  hostedApiBaseUrl = HOSTED_API_BASE_URL,
  apiKey = null,
  eventType = "user_delight",
  emotionalFamily,
  intensity = "low",
  confidence = 0.85,
  metadata = {},
  storage = createDefaultApiKeyStorage(),
  fetchImpl = fetch
} = {}) {
  const payload = buildReactionEvent({
    eventType,
    emotionalFamily,
    intensity,
    confidence,
    metadata
  });
  const result = await requestReaction({
    hostedApiBaseUrl,
    apiKey,
    payload,
    storage,
    fetchImpl
  });

  return {
    ...result,
    markdown: formatReactionMarkdown(result)
  };
}

export async function maybeAttachTemperatureReaction({
  mainReply,
  eventType,
  emotionalFamily,
  intensity = "low",
  confidence = 0.8,
  metadata = {},
  fetchImpl = fetch
}) {
  const payload = buildReactionEvent({
    eventType,
    emotionalFamily,
    intensity,
    confidence,
    metadata
  });

  const result = await requestReaction({ payload, fetchImpl });
  if (result.mode !== "react") {
    return {
      mainReply,
      reaction: null,
      debug: result
    };
  }

  return {
    mainReply,
    reaction: {
      displayMode: "after_main_reply",
      caption: result.reaction.caption,
      assetUrl: result.reaction.asset_url
    },
    debug: result
  };
}
