import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { order } from "./src/order.js";

const dataFile = resolve(process.env.DATA_FILE ?? "out/order-example.json");
await mkdir(dirname(dataFile), { recursive: true });
await writeFile(dataFile, '{"order":null}\n', { flag: "wx" }).catch((error) => {
  if (error.code !== "EEXIST") throw error;
});
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order desk · Proof-Jev example</title>
<style>body{font:18px/1.6 Georgia,serif;max-width:560px;margin:80px auto;padding:24px;background:#f5f2e9;color:#182a26}small{font:12px monospace;text-transform:uppercase}h1{font-size:48px;line-height:1.1}label{display:block}input,button{font:inherit;padding:10px;margin-top:10px}button{display:block;background:#182a26;color:white;border:0;padding:12px 22px}p[role=status]{border-top:1px solid #bbc4b9;padding-top:20px}</style>
<small>Proof-Jev / disposable order example</small><h1>Place an order.</h1><p>Orders require a positive, whole-number quantity.</p>
<form><label>Quantity <input name="quantity" inputmode="numeric" value="2"></label><button>Place order</button></form><p role="status" id="status">Ready</p>
<script>document.querySelector('form').onsubmit=async event=>{event.preventDefault();const response=await fetch('/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quantity:Number(document.querySelector('input').value)})});document.querySelector('#status').textContent=response.ok?'Order saved':'Order rejected';};</script></html>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/" && req.method === "GET") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    if (req.url === "/api/orders" && req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(await readFile(dataFile, "utf8"));
      return;
    }
    if (req.url === "/api/orders" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8000) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      const input = JSON.parse(body);
      // The business function is the only place enforcing the quantity contract.
      // The showcase deliberately removes its guard in a disposable copy.
      const result = await order(input, {
        insert: async (value) => {
          await writeFile(dataFile, JSON.stringify({ order: value }) + "\n");
          return value;
        },
      });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    res.writeHead(
      error instanceof RangeError ||
        error instanceof SyntaxError ||
        error instanceof TypeError
        ? 400
        : 500,
    );
    res.end("Order rejected");
  }
});
server.listen(Number(process.env.PORT ?? 4179), "127.0.0.1", () =>
  console.log(
    JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` }),
  ),
);
