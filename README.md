# OpenClaw Temperature Skill

OpenClaw Temperature adds a lightweight GIF reaction after OpenClaw's main reply when the moment deserves more warmth.

The skill is intentionally thin. The hosted service owns GIF selection, account state, trial expiry, recharge handling, throttling, and kill switches.

## Install

If your OpenClaw can install skills from GitHub, use this repository:

```text
https://github.com/wangych/OpenClaw-temperature-skill
```

If your OpenClaw supports CLI-style installation, try:

```bash
openclaw skills install github:wangych/OpenClaw-temperature-skill
```

If your OpenClaw only accepts chat instructions, send it this:

```text
Please install this OpenClaw skill:
https://claw-temp.nydhfc.cn/openclaw-skill/manifest.json

After installing it, run its initialization once and tell me the trial expiry time.
```

If your OpenClaw supports direct file URLs, use:

```text
https://claw-temp.nydhfc.cn/openclaw-skill/SKILL.md
https://claw-temp.nydhfc.cn/openclaw-skill/index.js
```

## Trial And Billing

The first run automatically creates an API key and starts a 1-month free trial.

When the trial expires, the skill returns:

```json
{
  "mode": "recharge_required",
  "reason": "trial_expired",
  "rechargeUrl": "https://claw-temp.nydhfc.cn/buy"
}
```

OpenClaw should show the recharge URL to the user.

## Recommended Triggers

Start with only these:

- `task_blocked`
- `task_success`
- `user_frustration`
- `user_delight`

Do not call this skill on every turn. It is designed for occasional emotional value, not constant animation.

## Auto Classification

For normal after-reply usage, OpenClaw can pass natural context and let the skill map it to the supported event taxonomy:

```js
import { maybeAttachTemperatureReaction } from "./index.js";

const result = await maybeAttachTemperatureReaction({
  mainReply,
  userMessage,
  metadata: {
    summary: "Short non-sensitive context"
  }
});
```

The classifier is intentionally conservative. If it does not see a clear success, blocked-task, frustration, or delight signal, it returns `no_reaction` without calling the hosted API.

## Direct GIF Requests

If the user directly asks OpenClaw to send a GIF, call `createTemperatureGifReply`:

```js
import { createTemperatureGifReply } from "./index.js";

const gif = await createTemperatureGifReply({
  eventType: "user_delight",
  emotionalFamily: "playful",
  metadata: {
    summary: "User directly asked for a fun GIF"
  }
});
```

Send `gif.markdown` if it is not empty.

If the chat surface renders external GIF markdown as a static preview, such as some WeChat bridges, the markdown also includes a hosted playback link. Open that link to see the animated version.

## Security Notes

This skill:

- Does not execute shell commands.
- Does not read arbitrary files.
- Does not upload full conversations.
- Stores only its API key.
- Calls only `https://claw-temp.nydhfc.cn`.

Keep `metadata` short and never include secrets.
