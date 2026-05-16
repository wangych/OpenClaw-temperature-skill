# OpenClaw Temperature

Use this skill when OpenClaw has finished its main reply and the conversation would benefit from a small emotional reaction.

## What This Skill Does

This is a thin OpenClaw client for the hosted OpenClaw Temperature service:

- It calls `https://claw-temp.nydhfc.cn`.
- It automatically registers one API key on first use.
- Each new API key gets a 1-month free trial by default.
- It stores the API key locally in OpenClaw's runtime.
- It asks the hosted API whether a GIF reaction should be shown.
- It can classify common conversation moments into supported reaction events.
- It returns a recharge prompt when the free trial has expired.
- It fails open: if the hosted API is unavailable, OpenClaw should continue the main reply without a GIF.

## When To Use

Use after the main reply for these moments:

- `task_blocked`: the user is stuck, missing a dependency, hit an install problem, or needs encouragement.
- `task_success`: the task finished, an install worked, or a problem was solved.
- `user_frustration`: the user is unhappy, disappointed, or complaining about the result.
- `user_delight`: the user is happy, surprised, or explicitly enjoying the interaction.

Start conservatively. Do not send a reaction every turn.

## How To Use

Import from `index.js` and call one of these functions:

```js
import {
  createTemperatureGifReply,
  initializeTemperatureLayer,
  maybeAttachTemperatureReaction
} from "./index.js";
```

Run initialization once if OpenClaw supports an install/init step:

```js
const init = await initializeTemperatureLayer();
```

For normal usage, call after OpenClaw has produced the main reply. Prefer passing natural context and let the skill classify the moment:

```js
const result = await maybeAttachTemperatureReaction({
  mainReply,
  userMessage,
  metadata: {
    summary: "User is blocked by an install or environment issue"
  }
});
```

If `result.reaction` is present, show it after the main reply. If it is `null`, do nothing.

You can still pass an explicit `eventType` when OpenClaw already knows the trigger:

```js
const result = await maybeAttachTemperatureReaction({
  mainReply,
  eventType: "task_blocked",
  autoClassify: false,
  metadata: {
    summary: "Dependency is missing"
  }
});
```

If the user directly asks OpenClaw to send a GIF, use `createTemperatureGifReply` and send its `markdown` result:

```js
const gif = await createTemperatureGifReply({
  eventType: "user_delight",
  emotionalFamily: "playful",
  metadata: {
    summary: "User directly asked for a fun GIF"
  }
});
```

If `gif.markdown` is not empty, send it as the GIF response. Do not use a third-party GIF search fallback unless this skill returns `no_reaction`.

Some chat surfaces, especially WeChat bridges, render external GIF markdown as a static first-frame preview. When this happens, keep the preview and also show the `open_url`/markdown playback link returned by this skill so the user can tap through to the hosted animation page.

## Recharge Handling

When the API key trial has expired, the hosted API returns `recharge_required`. This skill surfaces it as:

```js
{
  mode: "recharge_required",
  reason: "trial_expired",
  rechargeUrl: "https://claw-temp.nydhfc.cn/buy"
}
```

In that case, tell the user to open the recharge URL and renew the API key.

For a user-initiated recharge flow inside OpenClaw, call `getRechargeInstructions()` and render it with `formatRechargeMarkdown()`. The preferred link opens `/recharge?api_key=...`, where the API key is locked and the user can choose 5, 10, 20, 50, or 100 yuan. If the hosted service has a configured `paymentQrImageUrl`, the markdown also includes the payment QR image directly.

## Privacy And Safety

This skill intentionally stays small:

- It does not execute shell commands.
- It does not read arbitrary user files.
- It does not upload the full conversation.
- It only sends the minimal reaction event passed by OpenClaw.
- It stores only one API key locally.
- It does not block OpenClaw's main reply.

Keep metadata short and avoid secrets.
