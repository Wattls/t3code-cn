// Keep the self-use Chinese build isolated even when launched beside the official app.
process.env.T3CODE_HOME =
  process.env.T3CODE_ZH_TEST_HOME ||
  require("node:path").join(require("node:os").homedir(), ".t3-zh-test");
process.env.T3CODE_DISABLE_AUTO_UPDATE = "true";
require("./compileCache.cjs");
require("./main.cjs");
