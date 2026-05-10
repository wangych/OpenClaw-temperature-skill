# OpenClaw Temperature

Use this skill when OpenClaw has finished its main reply and the conversation would benefit from a small emotional reaction.

## What This Skill Does

This is a thin OpenClaw client for the hosted OpenClaw Temperature service:

- It calls `https://claw-temp.nydhfc.cn`.
- It automatically registers one API key on first use.
- Each new API key gets a 1-month free trial by default.
- It stores the API key locally in OpenClaw's runtime.
- It asks the hosted API whether a GIF reaction should be shown.
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
  initializeTemperatureLayer,
  maybeAttachTemperatureReaction
} from "./index.js";
```

Run initialization once if OpenClaw supports an install/init step:

```js
const init = await initializeTemperatureLayer();
```

For normal usage, call after OpenClaw has produced the main reply:

```js
const result = await maybeAttachTemperatureReaction({
  mainReply,
  eventType: "task_blocked",
  intensity: "low",
  metadata: {
    summary: "User is blocked by an install or environment issue"
  }
});
```

If `result.reaction` is present, show it after the main reply. If it is `null`, do nothing.

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

## Privacy And Safety

This skill intentionally stays small:

- It does not execute shell commands.
- It does not read arbitrary user files.
- It does not upload the full conversation.
- It only sends the minimal reaction event passed by OpenClaw.
- It stores only one API key locally.
- It does not block OpenClaw's main reply.

Keep metadata short and avoid secrets.
