import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  buildReactionEvent,
  createTemperatureGifReply,
  formatReactionMarkdown,
  initializeTemperatureLayer,
  requestReaction
} from "../index.js";

test("initializes by auto-registering a trial key", async () => {
  let storedApiKey = null;
  const storage = {
    async getItem() {
      return storedApiKey;
    },
    async setItem(apiKey) {
      storedApiKey = apiKey;
    }
  };
  const fetchImpl = async (url) => {
    assert.equal(url, "https://claw-temp.nydhfc.cn/v1/public/api-keys/register");
    return new Response(JSON.stringify({
      api_key_registration: {
        status: "trial_active",
        trial_expires_at: "2026-06-10T00:00:00.000Z",
        recharge_url: "https://claw-temp.nydhfc.cn/buy",
        apiKey: {
          token: "ocl_publishable_trial_key"
        }
      }
    }), { status: 201 });
  };

  const result = await initializeTemperatureLayer({ storage, fetchImpl });

  assert.equal(result.status, "trial_active");
  assert.equal(result.source, "registered");
  assert.equal(result.apiKeyHint, "ocl_pu..._key");
  assert.equal(result.trialExpiresAt, "2026-06-10T00:00:00.000Z");
  assert.equal(storedApiKey, "ocl_publishable_trial_key");
});

test("returns recharge-required for expired trials", async () => {
  const payload = buildReactionEvent({
    eventType: "task_blocked",
    metadata: {
      summary: "User is blocked"
    }
  });
  const storage = {
    async getItem() {
      return "ocl_expired_trial_key";
    },
    async setItem() {
      throw new Error("should not write storage");
    }
  };
  const fetchImpl = async (url) => {
    assert.equal(url, "https://claw-temp.nydhfc.cn/v1/reactions/decide");
    return new Response(JSON.stringify({
      code: "recharge_required",
      recharge_url: "https://claw-temp.nydhfc.cn/buy"
    }), { status: 402 });
  };

  const result = await requestReaction({ payload, storage, fetchImpl });

  assert.equal(result.mode, "recharge_required");
  assert.equal(result.degraded, false);
  assert.equal(result.reason, "trial_expired");
  assert.equal(result.rechargeUrl, "https://claw-temp.nydhfc.cn/buy");
  assert.equal(result.apiKeyHint, "ocl_ex..._key");
});

test("contains marketplace metadata", async () => {
  const [skill, source, manifest] = await Promise.all([
    fs.readFile("SKILL.md", "utf8"),
    fs.readFile("index.js", "utf8"),
    fs.readFile("manifest.json", "utf8")
  ]);
  const parsedManifest = JSON.parse(manifest);

  assert.equal(skill.includes("https://claw-temp.nydhfc.cn"), true);
  assert.equal(source.includes("initializeTemperatureLayer"), true);
  assert.equal(parsedManifest.name, "openclaw-temperature");
  assert.equal(parsedManifest.repository, "https://github.com/wangych/OpenClaw-temperature-skill");
  assert.equal(parsedManifest.billing.trial_days, 30);
  assert.deepEqual(parsedManifest.permissions.network, ["https://claw-temp.nydhfc.cn"]);
});

test("formats a direct GIF response as markdown", async () => {
  const reactionResult = {
    mode: "react",
    reaction: {
      caption: "这下气氛立刻活过来了",
      asset_url: "https://claw-temp.nydhfc.cn/assets/gifs/playful/user_delight/low/playful-user_delight-low-001.gif"
    }
  };

  const markdown = formatReactionMarkdown(reactionResult);

  assert.equal(markdown.includes("这下气氛立刻活过来了"), true);
  assert.equal(markdown.includes("![这下气氛立刻活过来了]("), true);
  assert.equal(markdown.includes("playful-user_delight-low-001.gif"), true);
});

test("creates markdown for direct user GIF requests", async () => {
  const calls = [];
  let storedApiKey = "ocl_direct_request_key";
  const storage = {
    async getItem() {
      return storedApiKey;
    },
    async setItem(apiKey) {
      storedApiKey = apiKey;
    }
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      decision: {
        status: "reacted",
        reason_codes: ["eligible", "asset_exact_match"]
      },
      reaction: {
        caption: "这下气氛立刻活过来了",
        asset_url: "https://claw-temp.nydhfc.cn/assets/gifs/playful/user_delight/low/playful-user_delight-low-001.gif"
      }
    }), { status: 200 });
  };

  const result = await createTemperatureGifReply({
    eventType: "user_delight",
    emotionalFamily: "playful",
    storage,
    fetchImpl
  });

  assert.equal(result.mode, "react");
  assert.equal(result.markdown.includes("playful-user_delight-low-001.gif"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.authorization, "Bearer ocl_direct_request_key");
});
