import { Client } from "ssh2";

const args = process.argv.slice(2);
const pipeStdin = args[0] === "--stdin";
const command = pipeStdin ? args[1] : args[0];
if (!command) {
  console.error("用法: node ssh.mjs [--stdin] '<远程命令>'");
  process.exit(1);
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(command, (error, stream) => {
      if (error) {
        console.error("执行失败:", error.message);
        conn.end();
        process.exit(1);
      }
      stream
        .on("close", (code) => {
          conn.end();
          process.exit(code ?? 0);
        })
        .on("data", (data) => process.stdout.write(data));
      stream.stderr.on("data", (data) => process.stderr.write(data));
      if (pipeStdin) {
        process.stdin.pipe(stream);
      } else {
        stream.end();
      }
    });
  })
  .on("error", (error) => {
    console.error("连接失败:", error.message);
    process.exit(1);
  })
  .connect({
    host: process.env.SSH_HOST || "47.110.139.146",
    port: Number(process.env.SSH_PORT || 22),
    username: process.env.SSH_USER || "tuoniao",
    password: process.env.SSH_PASS,
    readyTimeout: 30000,
  });
