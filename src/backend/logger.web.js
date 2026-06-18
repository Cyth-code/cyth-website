import { webMethod, Permissions } from 'wix-web-module';

const PREFIX = {
  LOG:  "⬤ [DIAG]",
  WARN: "▲ [WARN]",
  ERR:  "✖ [ERR ]",
};

export const L = webMethod(Permissions.Anyone, (tag, payload) => {
  if (payload !== undefined) {
    console.log(`${PREFIX.LOG} ${tag}:`, payload);
  } else {
    console.log(`${PREFIX.LOG} ${tag}`);
  }
});

export const W = webMethod(Permissions.Anyone, (tag, payload) => {
  console.warn(`${PREFIX.WARN} ${tag}:`, payload);
});

export const E = webMethod(Permissions.Anyone, (tag, err) => {
  console.error(`${PREFIX.ERR} ${tag}:`, err);
});