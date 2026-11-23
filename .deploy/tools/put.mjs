import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";

const [local, remote] = process.argv.slice(2);
if (!local || !remote) {
  console.error("用法: node put.mjs <本地文件> <远程路径>");
  process.exit(1);
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.sftp((error, sftp) => {
      if (error) {
        console.error("SFTP 失败:", error.message);
        process.exit(1);
      }
      const total = fs.statSync(local).size;
      sftp.fastPut(
        local,
        remote,
        { concurrency: 16, chunkSize: 32768, step: (transferred) => {
          process.stdout.write(`\r上传 ${path.basename(local)} ${((transferred / total) * 100).toFixed(1)}%`);
        } },
        (err) => {
          process.stdout.write("\n");
          if (err) {
            console.error("上传失败:", err.message);
            conn.end();
            process.exit(1);
          }
          console.log("上传完成:", remote);
          conn.end();
          process.exit(0);
        },
      );
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
