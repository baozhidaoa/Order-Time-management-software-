const { spawn } = require("child_process");

const electronBinary = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [".", "--generate-readme-screenshots"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("close", (code, signal) => {
  if (code === null) {
    console.error("README screenshot generation exited with signal:", signal);
    process.exit(1);
  }
  process.exit(code);
});
